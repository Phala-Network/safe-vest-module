const VestingModule = artifacts.require("VestingModule");
const Migrations = artifacts.require("Migrations");

const GnosisSafeProxyFactory = artifacts.require("@gnosis.pm/safe-contracts/GnosisSafeProxyFactory");
const CreateAndAddModules = artifacts.require("@gnosis.pm/safe-contracts/CreateAndAddModules");
const GnosisSafe = artifacts.require("@gnosis.pm/safe-contracts/GnosisSafe");

const deployedConst = {
  rinkeby: {
    GnosisSafeProxyFactory: '0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B',
    CreateAndAddModules: '0xF61A721642B0c0C8b334bA3763BA1326F53798C0',
    GnosisSafe: '0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F',
  }
}

async function getOrDeployOnNetwork(contract, deployer, network) {
  const name = contract.contractName;
  console.log('getOrDeploy ', name);
  const deployed = deployedConst[network];
  if (deployed && deployed[name]) {
    console.log('getOrDeploy: returning deployed at', deployed[name]);
    return await contract.at(deployed[name]);
  }
  console.log('getOrDeploy: deploying');
  await deployer.deploy(contract);
  return await contract.deployed();
}

const utils = {
  Address0: '0x0000000000000000000000000000000000000000',
}

module.exports = function(deployer, network, accounts) {
  const getOrDeploy = async (c) => { return await getOrDeployOnNetwork(c, deployer, network) };
  deployer.then(async () => {
    await deployer.deploy(VestingModule);
    const vestingModuleMasterCopy = await VestingModule.deployed();
    await vestingModuleMasterCopy.setup([], []);

    // get the master copies of the system
    const proxyFactory = await getOrDeploy(GnosisSafeProxyFactory);
    const createAndAddModules = await getOrDeploy(CreateAndAddModules);
    const gnosisSafeMasterCopy = await getOrDeploy(GnosisSafe);

    // prepare module creation call
    const moduleData = await vestingModuleMasterCopy.contract.methods.setup([utils.Address0], [100]).encodeABI();
    const proxyFactoryData = await proxyFactory.contract.methods
      .createProxy(vestingModuleMasterCopy.address, moduleData).encodeABI();
    const modulesCreationData = await createAndAddModules.contract.methods
      .createAndAddModules(proxyFactory.address, processModulesData([proxyFactoryData])).encodeABI();
    const createAndAddModulesData = await createAndAddModules.contract.methods.createAndAddModules(proxyFactory.address, modulesCreationData).encodeABI();

    // prepare craete module call
    const gnosisSafeData = await gnosisSafeMasterCopy.contract.methods.setup(
      [accounts[0]], 1, createAndAddModules.address, createAndAddModulesData,
      utils.Address0, utils.Address0, 0, utils.Address0
    ).encodeABI();

    const tx = await proxyFactory.createProxy(gnosisSafeMasterCopy.address, gnosisSafeData);
    const gnosisSafeAddress = getParamFromTxEvent(tx, 'ProxyCreation', 'proxy', proxyFactory.address);

    const migration = await Migrations.deployed();
    await migration.setSafeAddress(gnosisSafeAddress);
  });
};

// eslint-disable-next-line
const ModuleDataWrapper = new web3.eth.Contract([{"constant":false,"inputs":[{"name":"data","type":"bytes"}],"name":"setup","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"}]);

function processModulesData (dataArray) {
  return dataArray.reduce((acc, data) => acc + ModuleDataWrapper.methods.setup(data).encodeABI().substr(74), "0x")
}

function getParamFromTxEvent(transaction, eventName, paramName, contract) {
  // assert.isObject(transaction)
  let logs = transaction.logs
  if(eventName != null) {
      logs = logs.filter((l) => l.event === eventName && l.address === contract)
  }
  // assert.equal(logs.length, 1, 'too many logs found!')
  return logs[0].args[paramName]
}