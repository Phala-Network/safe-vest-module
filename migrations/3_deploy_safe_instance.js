const utils = require('./../lib/utils');

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

const kDeploySafe = true;
const kUseOrigin = false;

async function getOrDeployOnNetwork(contract, deployer, network) {
  const name = contract.contractName;
  console.log('getOrDeploy ', name);
  const deployed = deployedConst[network];
  if (deployed && deployed[name]) {
    console.log('  returning deployed at', deployed[name]);
    return await contract.at(deployed[name]);
  }
  if (kDeploySafe) {
    console.log('  deploying');
    await deployer.deploy(contract);
  }
  if (!kUseOrigin) {
    console.log('  new instance');
    const deployed = await contract.new();
    let receipt = await web3.eth.getTransactionReceipt(deployed.transactionHash)
    utils.logGasUsage('name', receipt);
    return deployed;
  }
  console.log('  deployed');
  return await contract.deployed();
}

module.exports = function(deployer, network, accounts) {
  const getOrDeploy = async (c) => { return await getOrDeployOnNetwork(c, deployer, network) };
  deployer.then(async () => {
    // get the master copies of the system
    const proxyFactory = await getOrDeploy(GnosisSafeProxyFactory);
    const createAndAddModules = await getOrDeploy(CreateAndAddModules);
    const gnosisSafeMasterCopy = await getOrDeploy(GnosisSafe);
    const vestingModuleMasterCopy = await getOrDeploy(VestingModule);

    const now = await utils.getBlockTimestamp(web3);
    const vestStartTime = now + 600;  // 10 mins

    // prepare module creation call
    const moduleData = await vestingModuleMasterCopy.contract.methods.setup(
      [utils.Address0], // token
      [vestStartTime], // start time
      [100],   // interval
      [100],  // amount
      [accounts[0]]   // to
    ).encodeABI();
    const proxyFactoryData = await proxyFactory.contract.methods.createProxy(vestingModuleMasterCopy.address, moduleData).encodeABI();
    const modulesCreationData = utils.processModulesData(web3, [proxyFactoryData]);
    const createAndAddModulesData = await createAndAddModules.contract.methods.createAndAddModules(proxyFactory.address, modulesCreationData).encodeABI();

    // prepare craete module call
    const gnosisSafeData = await gnosisSafeMasterCopy.contract.methods.setup(
      [accounts[0]], 1, createAndAddModules.address, createAndAddModulesData,
      utils.Address0, utils.Address0, 0, utils.Address0
    ).encodeABI();

    const tx = await proxyFactory.createProxy(gnosisSafeMasterCopy.address, gnosisSafeData);
    const gnosisSafeAddress = utils.getParamFromTxEvent(tx, 'ProxyCreation', 'proxy', proxyFactory.address);

    const migration = await Migrations.deployed();
    await migration.setSafeAddress(gnosisSafeAddress);
  });
};