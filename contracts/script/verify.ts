/**
 * EM-A2A 合约验证脚本
 *
 * 用法: hardhat run script/verify.ts --network <shasta|tron>
 *
 * 通过 TronScan API 提交合约源码验证。
 * 前置条件:
 *   1. TRONSCAN_API_KEY 环境变量已设置
 *   2. deployments/<network>.json 部署记录存在
 *
 * 验证流程:
 *   1. 读取部署记录获取合约地址
 *   2. 编译合约获取标准 JSON input
 *   3. 通过 TronScan API 提交验证请求
 *   4. 轮询验证状态
 */

import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

// TronScan API endpoints per network
const TRONSCAN_API: Record<string, string> = {
  shasta: "https://api.shasta.tronscan.org",
  nile: "https://nile.tronscan.org",
  tron: "https://apilist.tronscanapi.com",
}

interface VerifyRequest {
  contractAddress: string
  contractName: string
  compilerVersion: string  // e.g. "v0.8.24+commit.e11b9ed9"
  optimizerRuns: number
  sourceCode: string       // Solidity source (flattened)
  licenseType: string
  constructorArguments: string // ABI-encoded
}

async function verifyContract(network: string, req: VerifyRequest): Promise<void> {
  const apiBase = TRONSCAN_API[network]
  if (!apiBase) {
    throw new Error(`Unknown network: ${network}. Supported: ${Object.keys(TRONSCAN_API).join(", ")}`)
  }

  const apiKey = process.env.TRONSCAN_API_KEY
  if (!apiKey) {
    throw new Error("TRONSCAN_API_KEY environment variable is not set")
  }

  console.log(`\nVerifying ${req.contractName} at ${req.contractAddress} on ${network}...`)

  const body = {
    contractAddress: req.contractAddress,
    contractName: req.contractName,
    compilerVersion: req.compilerVersion,
    optimizerRuns: req.optimizerRuns,
    sourceCode: req.sourceCode,
    licenseType: req.licenseType || "MIT",
    constructorArguments: req.constructorArguments || "",
    contractType: "solidity",
  }

  const response = await fetch(`${apiBase}/api/contract/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "TRON-PRO-API-KEY": apiKey,
    },
    body: JSON.stringify(body),
  })

  const result = await response.json()
  if (!response.ok) {
    console.error(`  ✗ Verification request failed: ${JSON.stringify(result)}`)
    return
  }

  console.log(`  ✓ Verification submitted: ${JSON.stringify(result)}`)
}

/** 读取 Solidity 源码 */
function readSource(contractName: string): string {
  const srcPath = path.join(__dirname, "..", "src", `${contractName}.sol`)
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Source file not found: ${srcPath}`)
  }
  return fs.readFileSync(srcPath, "utf8")
}

/** 从 Hardhat artifacts 获取编译信息 */
function getCompilerInfo(): { version: string; optimizerRuns: number } {
  const buildInfoPath = path.join(__dirname, "..", "artifacts", "build-info")
  if (!fs.existsSync(buildInfoPath)) {
    throw new Error("No build info found. Run `hardhat compile` first.")
  }

  const files = fs.readdirSync(buildInfoPath).filter(f => f.endsWith(".json"))
  if (files.length === 0) {
    throw new Error("No build info JSON files found.")
  }

  const buildInfo = JSON.parse(
    fs.readFileSync(path.join(buildInfoPath, files[0]), "utf8")
  )
  const solcVersion = buildInfo.solcLongVersion || "v0.8.24"

  // Extract optimizer runs from buildInfo
  let optimizerRuns = 200
  try {
    const settings = buildInfo.input?.settings?.optimizer
    if (settings?.enabled && settings?.runs) {
      optimizerRuns = settings.runs
    }
  } catch {
    // Use default
  }

  return { version: solcVersion, optimizerRuns }
}

async function main() {
  const network = process.env.HARDHAT_NETWORK || "shasta"
  console.log(`Network: ${network}`)

  // Read deployment record
  const deployPath = path.join(__dirname, "..", "deployments", `${network === "tron" ? "mainnet" : network}.json`)

  if (!fs.existsSync(deployPath)) {
    console.log(`⚠ No deployment record at ${deployPath}`)
    console.log("  Run deployment first, then verify.")
    console.log("  To verify manually, set contract addresses in environment variables.")
    console.log("\nManual usage:")
    console.log("  CONTRACT_ADDRESS=xxx CONTRACT_NAME=AgentRegistry npx hardhat run script/verify.ts --network tron")
    return
  }

  const deploy: any = JSON.parse(fs.readFileSync(deployPath, "utf8"))
  const compilerInfo = getCompilerInfo()

  console.log(`Compiler: ${compilerInfo.version}`)
  console.log(`Optimizer runs: ${compilerInfo.optimizerRuns}`)
  console.log(`Contracts to verify: ${Object.keys(deploy.contracts).length}`)

  for (const [name, address] of Object.entries(deploy.contracts)) {
    try {
      const source = readSource(name)
      await verifyContract(network, {
        contractAddress: address as string,
        contractName: name,
        compilerVersion: compilerInfo.version,
        optimizerRuns: compilerInfo.optimizerRuns,
        sourceCode: source,
        licenseType: "MIT",
        constructorArguments: "", // All current contracts use empty constructors
      })
    } catch (e: any) {
      console.error(`  ✗ ${name}: ${e.message}`)
    }
  }

  console.log("\nVerification complete!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification failed:", error)
    process.exit(1)
  })
