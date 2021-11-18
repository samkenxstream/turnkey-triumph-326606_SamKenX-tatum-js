import { DeployErc721, BurnErc721, TransferErc721 } from '@tatumio/tatum-core'

import { sendAlgoCreateNFTSignedTransaction, sendAlgoTransferNFTSignedTransaction, sendAlgoBurnNFTSignedTransaction } from '../transaction'

/**
 * Create new NFT token.
 * @param testnet if we use testnet or not
 * @param body body of the create request
 * @param provider optional provider do broadcast tx
 */
export const deployNFT = async (testnet: boolean, body: DeployErc721, provider?: string) => {
  return sendAlgoCreateNFTSignedTransaction(testnet, body, provider)
}

/**
 * Burn new NFT token. Token will no longer exists.
 * @param testnet if we use testnet or not
 * @param body body of the burn request
 * @param provider optional provider do broadcast tx
 */
export const burnNFT = async (testnet: boolean, body: BurnErc721, provider?: string) => {
  return sendAlgoBurnNFTSignedTransaction(testnet, body, provider)
}

/**
 * Transfer new NFT token to new recipient.
 * @param testnet if we use testnet or not
 * @param body body of the mint request
 * @param provider optional provider do broadcast tx
 */
export const transferNFT = async (testnet: boolean, body: TransferErc721, provider?: string) => {
  return sendAlgoTransferNFTSignedTransaction(testnet, body, provider)
}

export { getNFTsByAddress, getNFTContractAddress, getNFTMetadataURI, getNFTImage, getNFTRoyalty } from '@tatumio/tatum-defi'