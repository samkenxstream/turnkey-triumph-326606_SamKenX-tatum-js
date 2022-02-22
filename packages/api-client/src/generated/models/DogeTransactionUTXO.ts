/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type DogeTransactionUTXO = {
    /**
     * Fee to be paid in DOGE.
     */
    fee: string;
    /**
     * Address, where unspent funds will be transferred.
     */
    changeAddress: string;
    /**
     * Array of transaction hashes, index of UTXO in it and corresponding private keys. Use this option if you want to calculate amount to send manually. Either fromUTXO or fromAddress must be present.
     */
    fromUTXO: Array<{
        /**
         * Transaction hash of the UTXO to be spent.
         */
        txHash: string;
        /**
         * Sent amount in DOGE.
         */
        value: string;
        /**
         * Receiving address.
         */
        address: string;
        /**
         * Index of the UTXO to be spent.
         */
        index: number;
        /**
         * Private key of the UTXO to be spent. Private key, or signature Id must be present.
         */
        privateKey: string;
    }>;
    /**
     * Array of addresses and values to send Litecoins to. Values must be set in LTC. Difference between from and to is transaction fee.
     */
    to: Array<{
        /**
         * Destination address.
         */
        address: string;
        /**
         * Amount to be sent, in DOGE.
         */
        value: number;
    }>;
}