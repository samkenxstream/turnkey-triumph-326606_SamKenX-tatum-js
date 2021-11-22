import {
  Currency,
  offchainBroadcast,
  offchainCancelWithdrawal,
  offchainStoreWithdrawal,
  validateBody,
  TransferOffchain,
} from '@tatumio/tatum-core'
import BigNumber from 'bignumber.js'
import { fromWei, toWei } from 'web3-utils'
import { getAccountById, getVirtualCurrencyByName } from '../ledger'
import { prepareKccSignedTransaction, prepareKccTransferErc20SignedTransaction } from '../transaction'
import { generatePrivateKeyFromMnemonic } from '../wallet'
import { offchainTransferKccKMS } from './kms'

/**
 * Send Kcc transaction from Tatum Ledger account to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param testnet mainnet or testnet version
 * @param body content of the transaction to broadcast
 * @param provider url of the Kcc Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain or id of the withdrawal, if it was not cancelled automatically
 */
export const sendKccOffchainTransaction = async (testnet: boolean, body: TransferOffchain, provider?: string) => {
  if (body.signatureId) {
    return offchainTransferKccKMS(body)
  }
  await validateBody(body, TransferOffchain)
  const { mnemonic, index, privateKey, gasLimit, gasPrice, nonce, ...withdrawal } = body
  const { amount, address } = withdrawal

  const fromPriv = mnemonic && index !== undefined ? await generatePrivateKeyFromMnemonic(testnet, mnemonic, index) : (privateKey as string)

  const account = await getAccountById(withdrawal.senderAccountId)
  let txData
  const fee = {
    gasLimit: gasLimit || '21000',
    gasPrice: gasPrice || '20',
  }
  if (account.currency === Currency.MATIC) {
    txData = await prepareKccSignedTransaction(
      {
        amount,
        fromPrivateKey: fromPriv,
        currency: account.currency,
        fee,
        nonce,
        to: address,
      },
      provider
    )
  } else {
    fee.gasLimit = '100000'
    const vc = await getVirtualCurrencyByName(account.currency)
    txData = await prepareKccTransferErc20SignedTransaction(
      {
        amount,
        fee,
        fromPrivateKey: fromPriv,
        to: address,
        digits: vc.precision as number,
        nonce,
        contractAddress: vc.erc20Address as string,
      },
      provider
    )
  }
  // @ts-ignore
  withdrawal.fee = fromWei(new BigNumber(fee.gasLimit).multipliedBy(toWei(fee.gasPrice, 'gwei')).toString(), 'ether')
  const { id } = await offchainStoreWithdrawal(withdrawal)
  try {
    return { ...(await offchainBroadcast({ txData, withdrawalId: id, currency: Currency.MATIC })), id }
  } catch (e) {
    console.error(e)
    try {
      await offchainCancelWithdrawal(id)
    } catch (e1) {
      console.log(e)
      return { id }
    }
  }
}
