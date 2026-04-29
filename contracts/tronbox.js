const port = process.env.TB_PORT || 9090

module.exports = {
  networks: {
    shasta: {
      privateKey:
        process.env.PRIVATE_KEY ||
        '0000000000000000000000000000000000000000000000000000000000000000',
      fullHost: 'https://api.shasta.trongrid.io',
      solidityNode: 'https://api.shasta.trongrid.io',
      eventServer: 'https://api.shasta.trongrid.io',
      network_id: '*',
    },
    mainnet: {
      privateKey:
        process.env.PRIVATE_KEY ||
        '0000000000000000000000000000000000000000000000000000000000000000',
      fullHost: 'https://api.trongrid.io',
      solidityNode: 'https://api.trongrid.io',
      eventServer: 'https://api.trongrid.io',
      network_id: '*',
    },
  },
  compilers: {
    solc: {
      version: '0.8.20',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
  solcCompiler: {
    compilerVersion: '0.8.20',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  contractsDirectory: 'src',
  contractsBuildDirectory: 'build/contracts',
  migrationsDirectory: 'migrations',
}
