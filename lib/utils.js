const abi = require("ethereumjs-abi")

module.exports = {
  Address0: '0x0000000000000000000000000000000000000000',
  // eslint-disable-next-line
  ModuleDataWrapper (web3) {
    return new web3.eth.Contract([{"constant":false,"inputs":[{"name":"data","type":"bytes"}],"name":"setup","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"}]);
  },
  processModulesData (web3, dataArray) {
    return dataArray.reduce(
      (acc, data) => acc + this.ModuleDataWrapper(web3).methods.setup(data).encodeABI().substr(74), "0x");
  },
  getParamFromTxEvent(transaction, eventName, paramName, contract) {
    let logs = transaction.logs;
    if(eventName != null) {
        logs = logs.filter((l) => l.event === eventName && l.address === contract);
    }
    return logs[0].args[paramName];
  },
  logGasUsage(subject, transactionOrReceipt) {
    let receipt = transactionOrReceipt.receipt || transactionOrReceipt;
    console.log("    Gas costs for " + subject + ": " + receipt.gasUsed);
  },
  async getErrorMessage(web3, to, value, data, from) {
    let returnData = await web3.eth.call({to, from, value, data})
    let returnBuffer = Buffer.from(returnData.slice(2), "hex")
    return abi.rawDecode(["string"], returnBuffer.slice(4))[0];
  },
  async getBlockTimestamp(web3) {
    return (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
  }
};
