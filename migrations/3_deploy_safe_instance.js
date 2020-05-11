const utils = require('./../lib/utils');
const BN = web3.utils.BN;

const VestingModule = artifacts.require("VestingModule");
const Token = artifacts.require("MockToken");
const Migrations = artifacts.require("Migrations");

const GnosisSafeProxyFactory = artifacts.require("@gnosis.pm/safe-contracts/GnosisSafeProxyFactory");
const CreateAndAddModules = artifacts.require("@gnosis.pm/safe-contracts/CreateAndAddModules");
const GnosisSafe = artifacts.require("@gnosis.pm/safe-contracts/GnosisSafe");

const networkParams = {
  rinkeby: {
    deployedAddress: {
      GnosisSafeProxyFactory: '0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B',
      CreateAndAddModules: '0xF61A721642B0c0C8b334bA3763BA1326F53798C0',
      GnosisSafe: '0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F',
      // USDT: '0xXXXXX'
    },
    vest: async ({web3, accounts}) => {
      return {
        startTime: await utils.getBlockTimestamp(web3) + 600,
        interval: 600,
        amount: new BN(100 * 1e6).toString(),
        to: accounts[0],
      }
    },
  },
  default: {
    deployedAddress: {},
    vest: async ({web3, accounts}) => {
      return {
        startTime: await utils.getBlockTimestamp(web3) + 600,
        interval: 600,
        amount: new BN(100 * 1e6).toString(),
        to: accounts[0],
      }
    },
  }
};

function getParams(network) {
  if (network in networkParams) {
    return networkParams[network];
  } else {
    return networkParams.default;
  }
}

const kDeploySafe = true;
const kUseOrigin = false;

async function getOrDeployOnNetwork(contract, deployer, network, contractName, args=[]) {
  const deployedAddress = getParams(network).deployedAddress;
  const name = contractName || contract.contractName;
  console.log('getOrDeploy ', name);
  const deployed = deployedAddress[network];
  if (deployed && deployed[name]) {
    console.log('  returning deployed at', deployed[name]);
    return await contract.at(deployed[name]);
  }
  if (kDeploySafe) {
    console.log('  deploying', args);
    await deployer.deploy(contract, ...args);
  }
  if (!kUseOrigin) {
    console.log('  new instance');
    const deployed = await contract.new(...args);
    let receipt = await web3.eth.getTransactionReceipt(deployed.transactionHash)
    utils.logGasUsage('name', receipt);
    return deployed;
  }
  console.log('  deployed');
  return await contract.deployed();
}

module.exports = function(deployer, network, accounts) {
  const getOrDeploy = async (c, n, a) => { return await getOrDeployOnNetwork(c, deployer, network, n, a) };
  const params = getParams(network);
  deployer.then(async () => {
    // get the master copies of the system
    const proxyFactory = await getOrDeploy(GnosisSafeProxyFactory);
    const createAndAddModules = await getOrDeploy(CreateAndAddModules);
    const gnosisSafeMasterCopy = await getOrDeploy(GnosisSafe);
    const vestingModuleMasterCopy = await getOrDeploy(VestingModule);
    const usdtToken = await getOrDeploy(Token, 'USDT', [new BN(10000 * 1e6)]);

    // prepare module creation call
    const {startTime, interval, amount, to} = await params.vest({web3, accounts});
    const moduleData = await vestingModuleMasterCopy.contract.methods.setup(
      [usdtToken.address],  // token
      [startTime],  // start time
      [interval],   // interval
      [amount],  // amount
      [to]   // to
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