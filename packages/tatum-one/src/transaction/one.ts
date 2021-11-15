import { HarmonyAddress } from '@harmony-js/crypto'
import {
  TransactionKMS,
  Currency,
  CreateRecord,
  GenerateCustodialAddress,
  DeployMarketplaceListing,
  DeployNftAuction,
  SmartContractMethodInvocation,
  SmartContractReadMethodInvocation,
  auction,
  erc1155TokenBytecode,
  erc20TokenBytecode,
  erc721TokenBytecode,
  listing,
  TATUM_API_URL,
  validateBody,
  obtainCustodialAddressType,
} from '@tatumio/tatum-core'
import { BigNumber } from 'bignumber.js'
import Web3 from 'web3'
import { TransactionConfig } from 'web3-core'
import { toWei } from 'web3-utils'
import { oneBroadcast } from '../blockchain'
import {
  OneBurn20,
  OneBurn721,
  OneBurnMultiToken,
  OneBurnMultiTokenBatch,
  OneDeploy20,
  OneDeploy721,
  OneDeployMultiToken,
  OneMint20,
  OneMint721,
  OneMintMultiple721,
  OneMintMultiToken,
  OneMintMultiTokenBatch,
  OneTransfer,
  OneTransfer20,
  OneTransfer721,
  OneTransferMultiToken,
  OneTransferMultiTokenBatch,
  OneUpdateCashback721,
} from '../model'
import { mintNFT } from '../nft'

const prepareGeneralTx = async (
  client: Web3,
  fromPrivateKey?: string,
  signatureId?: string,
  to?: string,
  amount?: string,
  nonce?: number,
  data?: string,
  gasLimit?: string,
  gasPrice?: string
) => {
  const recipient = to?.includes('one') ? new HarmonyAddress(to).basicHex : to
  const tx: TransactionConfig = {
    from: 0,
    to: recipient,
    value: amount ? `0x${new BigNumber(toWei(amount, 'ether')).toString(16)}` : undefined,
    data,
    gas: gasLimit,
    nonce,
    gasPrice: gasPrice ? `0x${new BigNumber(toWei(gasPrice, 'gwei')).toString(16)}` : await client.eth.getGasPrice(),
  }

  if (signatureId) {
    return JSON.stringify(tx)
  }
  tx.gas = gasLimit || (await client.eth.estimateGas({ to: recipient, data: data || '', value: tx.value }))
  return (await client.eth.accounts.signTransaction(tx, fromPrivateKey as string)).rawTransaction as string
}

/**
 * Send Harmony transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneTransaction = async (body: OneTransfer, provider?: string) => {
  return oneBroadcast(await prepareOneSignedTransaction(body, provider))
}

export const prepareOneClient = (provider?: string, fromPrivateKey?: string) => {
  const client = new Web3(provider || `${process.env.TATUM_API_URL || TATUM_API_URL}/v3/one/web3/${process.env.TATUM_API_KEY}`)
  if (fromPrivateKey) {
    client.eth.accounts.wallet.clear()
    client.eth.accounts.wallet.add(fromPrivateKey)
    client.eth.defaultAccount = client.eth.accounts.wallet[0].address
  }
  return client
}

/**
 * Sign Harmony pending transaction from Tatum KMS
 * @param tx pending transaction from KMS
 * @param fromPrivateKey private key to sign transaction with.
 * @param testnet mainnet or testnet version
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const signOneKMSTransaction = async (tx: TransactionKMS, fromPrivateKey: string, testnet: boolean, provider?: string) => {
  if (tx.chain !== Currency.ONE) {
    throw Error('Unsupported chain.')
  }
  const client = prepareOneClient(provider, fromPrivateKey)
  const transactionConfig = JSON.parse(tx.serializedTransaction)
  if (!transactionConfig.gas) {
    transactionConfig.gas = await client.eth.estimateGas({ to: transactionConfig.to, data: transactionConfig.data })
  }
  if (
    !transactionConfig.gasPrice ||
    transactionConfig.gasPrice === '0' ||
    transactionConfig.gasPrice === 0 ||
    transactionConfig.gasPrice === '0x0'
  ) {
    transactionConfig.gasPrice = await client.eth.getGasPrice()
  }
  return (await client.eth.accounts.signTransaction(transactionConfig, fromPrivateKey)).rawTransaction as string
}

/**
 * Sign Harmony transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneSignedTransaction = async (body: OneTransfer, provider?: string) => {
  await validateBody(body, OneTransfer)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    body.to,
    body.amount,
    body.nonce,
    undefined,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony store data transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneStoreDataTransaction = async (body: CreateRecord, provider?: string) => {
  await validateBody(body, CreateRecord)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  const hexData = client.utils.isHex(body.data) ? client.utils.stringToHex(body.data) : client.utils.toHex(body.data)
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    body.to || client.eth.accounts.wallet[0].address,
    undefined,
    body.nonce,
    hexData,
    body.ethFee?.gasLimit,
    body.ethFee?.gasPrice
  )
}

/**
 * Sign Harmony mint erc20 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneMint20SignedTransaction = async (body: OneMint20, provider?: string) => {
  await validateBody(body, OneMint20)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const contract = new client.eth.Contract(erc20TokenABI, new HarmonyAddress(body.contractAddress).basicHex.trim())
  const digits = new BigNumber(10).pow(await contract.methods.decimals().call())
  const data = contract.methods
    .mint(new HarmonyAddress(body.to).basicHex, `0x${new BigNumber(body.amount).multipliedBy(digits).toString(16)}`)
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony burn erc20 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneBurn20SignedTransaction = async (body: OneBurn20, provider?: string) => {
  await validateBody(body, OneBurn20)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const contract = new client.eth.Contract(erc20TokenABI, new HarmonyAddress(body.contractAddress).basicHex.trim())
  const digits = new BigNumber(10).pow(await contract.methods.decimals().call())
  const data = contract.methods.burn(`0x${new BigNumber(body.amount).multipliedBy(digits).toString(16)}`).encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony transfer erc20 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneTransfer20SignedTransaction = async (body: OneTransfer20, provider?: string) => {
  await validateBody(body, OneTransfer20)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  const decimals = new BigNumber(10).pow(body.digits as number)
  // @ts-ignore
  const data = new client.eth.Contract(erc20TokenABI, new HarmonyAddress(body.contractAddress).basicHex.trim()).methods
    .transfer(new HarmonyAddress(body.to).basicHex, `0x${new BigNumber(body.amount).multipliedBy(decimals).toString(16)}`)
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress as string).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

export const getOne20ContractDecimals = async (contractAddress: string, provider?: string) => {
  if (!contractAddress) {
    throw new Error('Contract address not set.')
  }
  const client = await prepareOneClient(provider)
  // @ts-ignore
  const contract = new client.eth.Contract(erc20_abi, contractAddress.trim())
  return await contract.methods.decimals().call()
}

/**
 * Sign Harmony generate custodial wallet transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneGenerateCustodialWalletSignedTransaction = async (
  body: GenerateCustodialAddress,
  provider?: string
) => {
  await validateBody(body, GenerateCustodialAddress)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  const { abi, code } = obtainCustodialAddressType(body)
  // @ts-ignore
  const contract = new client.eth.Contract(abi)
  const data = contract
    .deploy({
      data: code,
    })
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    undefined,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign ONE generate custodial wallet address transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the One Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain, or signatureId in case of Tatum KMS
 */
export const prepareOneDeployMarketplaceListingSignedTransaction = async (
  body: DeployMarketplaceListing,
  provider?: string
) => {
  await validateBody(body, DeployMarketplaceListing)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const contract = new client.eth.Contract(auction.abi)
  const data = contract
    .deploy({
      data: auction.data,
      arguments: [body.marketplaceFee, body.feeRecipient],
    })
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    undefined,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}
/**
 * Sign ONE deploy NFT Auction contract transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the One Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain, or signatureId in case of Tatum KMS
 */
export const prepareOneDeployAuctionSignedTransaction = async (body: DeployNftAuction, provider?: string) => {
  await validateBody(body, DeployNftAuction)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const contract = new client.eth.Contract(listing.abi)
  const data = contract
    .deploy({
      data: listing.data,
      arguments: [body.auctionFee, body.feeRecipient],
    })
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    undefined,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony deploy erc20 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneDeploy20SignedTransaction = async (body: OneDeploy20, provider?: string) => {
  await validateBody(body, OneDeploy20)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const contract = new client.eth.Contract(erc20TokenABI)
  const data = contract
    .deploy({
      data: erc20TokenBytecode,
      arguments: [
        body.name,
        body.symbol,
        new HarmonyAddress(body.address).basicHex,
        body.digits,
        `0x${new BigNumber(body.totalCap || body.supply).multipliedBy(new BigNumber(10).pow(body.digits)).toString(16)}`,
        `0x${new BigNumber(body.supply).multipliedBy(new BigNumber(10).pow(body.digits)).toString(16)}`,
      ],
    })
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    undefined,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony mint erc721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneMint721SignedTransaction = async (body: OneMint721, provider?: string) => {
  await validateBody(body, OneMint721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .mintWithTokenURI(new HarmonyAddress(body.to).basicHex, body.tokenId, body.url)
    .encodeABI()
  if (body.contractAddress) {
    return prepareGeneralTx(
      client,
      body.fromPrivateKey,
      body.signatureId,
      new HarmonyAddress(body.contractAddress).basicHex,
      undefined,
      body.nonce,
      data,
      body.fee?.gasLimit,
      body.fee?.gasPrice
    )
  }
  throw new Error('Contract address should not be empty!')
}

/**
 * Sign Harmony mint cashback erc721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneMintCashback721SignedTransaction = async (body: OneMint721, provider?: string) => {
  await validateBody(body, OneMint721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  const cashbacks: string[] = body.cashbackValues!
  const cb = cashbacks.map((c) => `0x${new BigNumber(client.utils.toWei(c, 'ether')).toString(16)}`)
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .mintWithCashback(
      new HarmonyAddress(body.to).basicHex,
      body.tokenId,
      body.url,
      body.authorAddresses?.map((a) => new HarmonyAddress(a).basicHex),
      cb
    )
    .encodeABI()
  if (body.contractAddress) {
    return prepareGeneralTx(
      client,
      body.fromPrivateKey,
      body.signatureId,
      new HarmonyAddress(body.contractAddress).basicHex,
      undefined,
      body.nonce,
      data,
      body.fee?.gasLimit,
      body.fee?.gasPrice
    )
  }
  throw new Error('Contract address should not be empty!')
}

/**
 * Sign Harmony mint multiple cashback erc721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneMintMultipleCashback721SignedTransaction = async (body: OneMintMultiple721, provider?: string) => {
  await validateBody(body, OneMintMultiple721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  const cashbacks: string[][] = body.cashbackValues!
  const cb = cashbacks.map((cashback) => cashback.map((c) => `0x${new BigNumber(client.utils.toWei(c, 'ether')).toString(16)}`))
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .mintMultipleCashback(
      body.to.map((t) => new HarmonyAddress(t).basicHex),
      body.tokenId,
      body.url,
      body.authorAddresses?.map((a) => a.map((a1) => new HarmonyAddress(a1).basicHex)),
      cb
    )
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony mint multiple erc721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneMintMultiple721SignedTransaction = async (body: OneMintMultiple721, provider?: string) => {
  await validateBody(body, OneMintMultiple721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .mintMultiple(
      body.to.map((t) => t.trim()),
      body.tokenId,
      body.url
    )
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony burn erc721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneBurn721SignedTransaction = async (body: OneBurn721, provider?: string) => {
  await validateBody(body, OneBurn721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .burn(body.tokenId)
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony transfer erc721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneTransfer721SignedTransaction = async (body: OneTransfer721, provider?: string) => {
  await validateBody(body, OneTransfer721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .safeTransfer(new HarmonyAddress(body.to).basicHex, body.tokenId)
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    body.value,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony update cashback for author 721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneUpdateCashbackForAuthor721SignedTransaction = async (
  body: OneUpdateCashback721,
  provider?: string
) => {
  await validateBody(body, OneUpdateCashback721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .updateCashbackForAuthor(body.tokenId, `0x${new BigNumber(toWei(body.cashbackValue, 'ether')).toString(16)}`)
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony deploy erc721 transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneDeploy721SignedTransaction = async (body: OneDeploy721, provider?: string) => {
  await validateBody(body, OneDeploy721)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc721TokenABI)
    .deploy({
      arguments: [body.name, body.symbol],
      data: erc721TokenBytecode,
    })
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    undefined,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony burn multiple tokens transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneBurnMultiTokenSignedTransaction = async (body: OneBurnMultiToken, provider?: string) => {
  await validateBody(body, OneBurnMultiToken)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc1155TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .burn(new HarmonyAddress(body.account).basicHex, body.tokenId, body.amount)
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony burn multiple tokens batch transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneBurnMultiTokenBatchSignedTransaction = async (body: OneBurnMultiTokenBatch, provider?: string) => {
  await validateBody(body, OneBurnMultiTokenBatch)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc1155TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .burnBatch(new HarmonyAddress(body.account).basicHex, body.tokenId, body.amounts)
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony transfer multiple tokens transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneTransferMultiTokenSignedTransaction = async (body: OneTransferMultiToken, provider?: string) => {
  await validateBody(body, OneTransferMultiToken)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc1155TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .safeTransfer(
      new HarmonyAddress(body.to).basicHex,
      body.tokenId,
      `0x${new BigNumber(body.amount).toString(16)}`,
      body.data ? body.data : '0x0'
    )
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony batch transfer multiple tokens transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneBatchTransferMultiTokenSignedTransaction = async (
  body: OneTransferMultiTokenBatch,
  provider?: string
) => {
  await validateBody(body, OneTransferMultiTokenBatch)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  const amts = body.amounts.map((amt) => `0x${new BigNumber(amt).toString(16)}`)
  // @ts-ignore
  const data = new client.eth.Contract(erc1155TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .safeBatchTransfer(
      new HarmonyAddress(body.to).basicHex,
      body.tokenId.map((token) => token.trim()),
      amts,
      body.data ? body.data : '0x0'
    )
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony mint multiple tokens transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneMintMultiTokenSignedTransaction = async (body: OneMintMultiToken, provider?: string) => {
  await validateBody(body, OneMintMultiToken)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc1155TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .mint(new HarmonyAddress(body.to).basicHex, body.tokenId, `0x${new BigNumber(body.amount).toString(16)}`, body.data ? body.data : '0x0')
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony mint multiple tokens transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneMintMultiTokenBatchSignedTransaction = async (body: OneMintMultiTokenBatch, provider?: string) => {
  await validateBody(body, OneMintMultiTokenBatch)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  const batchAmounts = body.amounts.map((amts) => amts.map((amt) => `0x${new BigNumber(amt).toString(16)}`))
  // @ts-ignore
  const data = new client.eth.Contract(erc1155TokenABI, new HarmonyAddress(body.contractAddress).basicHex).methods
    .mintBatch(
      body.to.map((a) => new HarmonyAddress(a).basicHex),
      body.tokenId,
      batchAmounts,
      body.data ? body.data : '0x0'
    )
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    new HarmonyAddress(body.contractAddress).basicHex,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony deploy multiple tokens transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneDeployMultiTokenSignedTransaction = async (body: OneDeployMultiToken, provider?: string) => {
  await validateBody(body, OneDeployMultiToken)
  const client = await prepareOneClient(provider, body.fromPrivateKey)
  // @ts-ignore
  const data = new client.eth.Contract(erc1155TokenABI)
    .deploy({
      arguments: [body.uri],
      data: erc1155TokenBytecode,
    })
    .encodeABI()
  return prepareGeneralTx(
    client,
    body.fromPrivateKey,
    body.signatureId,
    undefined,
    undefined,
    body.nonce,
    data,
    body.fee?.gasLimit,
    body.fee?.gasPrice
  )
}

/**
 * Sign Harmony smart contract write method invocation transaction with private keys locally. Nothing is broadcast to the blockchain.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction data to be broadcast to blockchain.
 */
export const prepareOneSmartContractWriteMethodInvocation = async (
  body: SmartContractMethodInvocation,
  provider?: string
) => {
  await validateBody(body, SmartContractMethodInvocation)
  const { fromPrivateKey, fee, params, methodName, methodABI, amount, contractAddress, nonce, signatureId } = body
  const client = await prepareOneClient(provider, fromPrivateKey)

  const data = new client.eth.Contract([methodABI]).methods[methodName as string](...params).encodeABI()
  return prepareGeneralTx(
    client,
    fromPrivateKey,
    signatureId,
    new HarmonyAddress(contractAddress).basicHex,
    amount,
    nonce,
    data,
    fee?.gasLimit,
    fee?.gasPrice
  )
}

/**
 * Send Harmony smart contract read method invocation transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param testnet
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneSmartContractReadMethodInvocationTransaction = async (
  testnet: boolean,
  body: SmartContractReadMethodInvocation,
  provider?: string
) => {
  await validateBody(body, SmartContractReadMethodInvocation)
  const { params, methodName, methodABI, contractAddress } = body
  const client = prepareOneClient(provider)
  const contract = new client.eth.Contract([methodABI], contractAddress)
  return { data: await contract.methods[methodName as string](...params).call() }
}

/**
 * Send Harmony store data transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneStoreDataTransaction = async (body: CreateRecord, provider?: string) =>
  oneBroadcast(await prepareOneStoreDataTransaction(body, provider))

/**
 * Send Harmony mint erc20 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneMint20SignedTransaction = async (body: OneMint20, provider?: string) =>
  oneBroadcast(await prepareOneMint20SignedTransaction(body, provider))

/**
 * Send Harmony burn erc20 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneBurn20SignedTransaction = async (body: OneBurn20, provider?: string) =>
  oneBroadcast(await prepareOneBurn20SignedTransaction(body, provider))

/**
 * Send Harmony transfer erc20 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneTransfer20SignedTransaction = async (body: OneTransfer20, provider?: string) =>
  oneBroadcast(await prepareOneTransfer20SignedTransaction(body, provider))
/**
 * Send Harmony deploy erc20 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneDeploy20SignedTransaction = async (body: OneDeploy20, provider?: string) =>
  oneBroadcast(await prepareOneDeploy20SignedTransaction(body, provider))

/**
 * Send Harmony mint erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneMint721SignedTransaction = async (body: OneMint721, provider?: string) => {
  if (!body.fromPrivateKey && !body.fromPrivateKey) {
    return mintNFT(body)
  }

  return oneBroadcast(await prepareOneMint721SignedTransaction(body, provider))
}

/**
 * Send Harmony mint cashback erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneMintCashback721SignedTransaction = async (body: OneMint721, provider?: string) =>
  oneBroadcast(await prepareOneMintCashback721SignedTransaction(body, provider))

/**
 * Send Harmony mint multiple cashback erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneMintMultipleCashback721SignedTransaction = async (body: OneMintMultiple721, provider?: string) =>
  oneBroadcast(await prepareOneMintMultipleCashback721SignedTransaction(body, provider))

/**
 * Send Harmony mint multiple erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneMintMultiple721SignedTransaction = async (body: OneMintMultiple721, provider?: string) =>
  oneBroadcast(await prepareOneMintMultiple721SignedTransaction(body, provider))

/**
 * Send Harmony burn erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneBurn721SignedTransaction = async (body: OneBurn721, provider?: string) =>
  oneBroadcast(await prepareOneBurn721SignedTransaction(body, provider))

/**
 * Send Harmony transfer erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneTransfer721SignedTransaction = async (body: OneTransfer721, provider?: string) =>
  oneBroadcast(await prepareOneTransfer721SignedTransaction(body, provider))

/**
 * Send Harmony update cashback for author erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneUpdateCashbackForAuthor721SignedTransaction = async (body: OneUpdateCashback721, provider?: string) =>
  oneBroadcast(await prepareOneUpdateCashbackForAuthor721SignedTransaction(body, provider))

/**
 * Send Harmony deploy erc721 transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneDeploy721SignedTransaction = async (body: OneDeploy721, provider?: string) =>
  oneBroadcast(await prepareOneDeploy721SignedTransaction(body, provider))

/**
 * Send Harmony burn multiple tokens transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneBurnMultiTokenSignedTransaction = async (body: OneBurnMultiToken, provider?: string) =>
  oneBroadcast(await prepareOneBurnMultiTokenSignedTransaction(body, provider))

/**
 * Send Harmony burn multiple tokens batch transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneBurnMultiTokenBatchSignedTransaction = async (body: OneBurnMultiTokenBatch, provider?: string) =>
  oneBroadcast(await prepareOneBurnMultiTokenBatchSignedTransaction(body, provider))

/**
 * Send Harmony transfer multiple tokens transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneTransferMultiTokenSignedTransaction = async (body: OneTransferMultiToken, provider?: string) =>
  oneBroadcast(await prepareOneTransferMultiTokenSignedTransaction(body, provider))

/**
 * Send Harmony batch transfer multiple tokens transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneBatchTransferMultiTokenSignedTransaction = async (
  body: OneTransferMultiTokenBatch,
  provider?: string
) => oneBroadcast(await prepareOneBatchTransferMultiTokenSignedTransaction(body, provider))

/**
 * Send Harmony mint multiple tokens transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneMintMultiTokenSignedTransaction = async (body: OneMintMultiToken, provider?: string) =>
  oneBroadcast(await prepareOneMintMultiTokenSignedTransaction(body, provider))

/**
 * Send Harmony mint multiple tokens batch transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneMintMultiTokenBatchSignedTransaction = async (body: OneMintMultiTokenBatch, provider?: string) =>
  oneBroadcast(await prepareOneMintMultiTokenBatchSignedTransaction(body, provider))

/**
 * Send Harmony deploy multiple tokens transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneDeployMultiTokenSignedTransaction = async (body: OneDeployMultiToken, provider?: string) =>
  oneBroadcast(await prepareOneDeployMultiTokenSignedTransaction(body, provider))

/**
 * Send Harmony mint generate custodial wallet signed transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneGenerateCustodialWalletSignedTransaction = async (
  body: GenerateCustodialAddress,
  provider?: string
) => oneBroadcast(await prepareOneGenerateCustodialWalletSignedTransaction(body, provider), body.signatureId)

/**
 * Deploy new smart contract for NFT marketplace logic. Smart contract enables marketplace operator to create new listing for NFT (ERC-721/1155).
 * @param body request data
 * @param provider optional provider to enter. if not present, Tatum Web3 will be used.
 * @returns {txId: string} Transaction ID of the operation, or signatureID in case of Tatum KMS
 */
export const sendOneDeployMarketplaceListingSignedTransaction = async (
  body: DeployMarketplaceListing,
  provider?: string
) => oneBroadcast(await prepareOneDeployMarketplaceListingSignedTransaction(body, provider), body.signatureId)

/**
 * Send Harmony smart contract method invocation transaction to the blockchain. This method broadcasts signed transaction to the blockchain.
 * This operation is irreversible.
 * @param testnet
 * @param body content of the transaction to broadcast
 * @param provider url of the Harmony Server to connect to. If not set, default public server will be used.
 * @returns transaction id of the transaction in the blockchain
 */
export const sendOneSmartContractMethodInvocationTransaction = async (
  testnet: boolean,
  body: SmartContractMethodInvocation | SmartContractReadMethodInvocation,
  provider?: string
) => {
  if (body.methodABI.stateMutability === 'view') {
    return sendOneSmartContractReadMethodInvocationTransaction(testnet, body as SmartContractReadMethodInvocation, provider)
  }
  return oneBroadcast(
    await prepareOneSmartContractWriteMethodInvocation(body, provider),
    (body as SmartContractMethodInvocation).signatureId
  )
}
