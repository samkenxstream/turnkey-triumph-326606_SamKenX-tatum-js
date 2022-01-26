import { TronWallet } from '@tatumio/api-client'
import { EvmBasedBlockchain } from '@tatumio/shared-core'
import { evmBasedUtils } from '../evm-based.utils'

export const evmBasedWallet = (args: { blockchain: EvmBasedBlockchain }) => {
  return {
    /**
     * Generate address
     * @param xpub extended public key to generate address from
     * @param i derivation index of address to generate. Up to 2^31 addresses can be generated.
     * @returns blockchain address
     */
    generateAddressFromXPub(xpub: string, i: number): string {
      return evmBasedUtils.generateAddressFromXPub(xpub, i)
    },

    /**
     * Generate ERC20 private key from mnemonic seed
     * @param mnemonic mnemonic to generate private key from
     * @param i derivation index of private key to generate.
     * @param options optional testnet or mainnet version of address. Default: mainnet
     * @returns blockchain private key to the address
     */
    async generatePrivateKeyFromMnemonic(
      mnemonic: string,
      i: number,
      options?: { testnet: boolean },
    ): Promise<string> {
      return evmBasedUtils.generatePrivateKeyFromMnemonic(args.blockchain, mnemonic, i, options)
    },

    /**
     * Generate address from private key
     * @param privateKey private key to use
     * @returns blockchain private key to the address
     */
    generateAddressFromPrivateKey(privateKey: string): string {
      return evmBasedUtils.generateAddressFromPrivateKey(args.blockchain, privateKey)
    },

    // @TODO replace with general wallet (DTO)
    /**
     * Generate wallet
     * @param mnemonic mnemonic seed to use. If not present, new one will be generated
     * @param options optional testnet or mainnet version of address. Default: mainnet
     * @returns wallet or a combination of address and private key
     */
    async generateWallet(mnemonic?: string, options?: { testnet: boolean }): Promise<TronWallet> {
      return evmBasedUtils.generateBlockchainWallet(args.blockchain, mnemonic, options)
    },
  }
}