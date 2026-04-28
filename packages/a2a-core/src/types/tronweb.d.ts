/**
 * TronWeb minimal type declarations
 *
 * Provides TypeScript types for the tronweb library used in TronAdapter.
 * These are intentionally minimal — only exposing the surface we consume.
 */

declare module 'tronweb' {
  export interface TronWebOptions {
    fullHost?: string
    solidityNode?: string
    eventServer?: string
    privateKey?: string
    fullNode?: string
    headers?: Record<string, string>
  }

  export interface TriggerResult {
    result: { result: boolean }
    transaction: TronTransaction
  }

  export interface TronTransaction {
    txID: string
    visible: boolean
    raw_data: Record<string, unknown>
    raw_data_hex: string
    signature?: string[]
  }

  export interface SignedTransaction {
    txID: string
    transaction: TronTransaction
  }

  export interface TransactionResult {
    txid: string
    blockNumber: number
    result: boolean
    receipt: {
      energy_usage: number
      energy_usage_total: number
      net_usage: number
      result: string
    }
  }

  export interface TransactionInfo {
    txID: string
    blockNumber: number
    blockTimeStamp: number
    contractResult: string[]
    receipt: {
      energy_usage: number
      energy_usage_total: number
      net_usage: number
      result: string
    }
  }

  export interface ContractInstance {
    at(address: string): Promise<ContractInstance>
    [method: string]: (...args: any[]) => {
      call(options?: any): Promise<any>
      send(options?: any): Promise<TransactionResult>
    }
  }

  export interface TronWebAddress {
    toHex(address: string): string
    fromHex(hex: string): string
  }

  export class TronWeb {
    address: TronWebAddress
    defaultAddress: {
      base58: string
      hex: string
    }

    constructor(options: TronWebOptions)

    trx: {
      sign(transaction: TronTransaction): Promise<SignedTransaction>
      sendRawTransaction(signedTx: SignedTransaction): Promise<TransactionResult>
      getBalance(address: string): Promise<number>
      getTransaction(txHash: string): Promise<TransactionInfo>
    }

    transactionBuilder: {
      triggerSmartContract(
        contractAddress: string,
        functionSelector: string,
        options: Record<string, unknown>,
        parameters: Array<{ type: string; value: string }>,
        issuerAddress: string,
      ): Promise<TriggerResult>
      sendTrx(to: string, amount: string): Promise<TronTransaction>
    }

    contract(): {
      at(address: string): Promise<ContractInstance>
    }
  }
}

declare const TronWeb: typeof import('tronweb').TronWeb
