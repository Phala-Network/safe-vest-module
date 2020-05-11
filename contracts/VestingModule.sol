pragma solidity >=0.5.0 <0.7.0;
import "@gnosis.pm/safe-contracts/contracts/base/Module.sol";
import "@gnosis.pm/safe-contracts/contracts/base/ModuleManager.sol";
import "@gnosis.pm/safe-contracts/contracts/base/OwnerManager.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";


/// @title Vesting Module - Allows to transfer limited amounts of ERC20 tokens and Ether without confirmations.
/// @author Stefan George - <stefan@gnosis.pm>
contract VestingModule is Module {
    using SafeMath for uint256;

    string public constant NAME = "Vesting Module";
    string public constant VERSION = "0.1.0";

    // dailyLimits mapping maps token address to daily limit settings.
    mapping (address => Vest) public vests;

    struct Vest {
        uint256 startDate;
        uint256 interval;
        uint256 amount;
        address to;

        uint256 numVestSent;
    }

    event VestAdded(address token, uint256 startDate, uint256 interval, uint256 amount, address to, uint256 timestamp);
    event TransferVested(address token, uint256 amount, uint256 numVest, uint256 timestamp);

    /// @dev Setup function sets initial storage of contract.
    /// @param tokens List of token addresses. Ether is represented with address 0x0.
    /// @param startDates List of start date in unix timestamp.
    /// @param intervals List of the interval between each vest in seconds.
    /// @param amounts List of amounts of each release in the minimal unit.
    /// @param tos List of token / ether transfer target address.
    function setup(
        address[] memory tokens,
        uint256[] memory startDates,
        uint256[] memory intervals,
        uint256[] memory amounts,
        address[] memory tos
    )
        public
    {
        // setManager prevents calling setup twice.
        setManager();
        for (uint256 i = 0; i < tokens.length; i++) {
            setVest(tokens[i], startDates[i], intervals[i], amounts[i], tos[i]);
        }
    }

    function setVest(address token, uint256 startDate, uint256 interval, uint256 amount, address to)
        public
        authorized
    {
        /* solium-disable-next-line security/no-block-members */
        uint256 blocktime = block.timestamp;
        require(startDate >= blocktime, "Start date shouldn't be earlier than now");
        require(interval > 0, "Vest interval mustn't be zero");
        require(amount > 0, "Vest amount mustn't be zero");
        require(to != address(0), "Invalid to address");

        vests[token] = Vest({
            startDate: startDate,
            interval: interval,
            amount: amount,
            to: to,
            numVestSent: 0
        });

        emit VestAdded(token, startDate, interval, amount, to, blocktime);
    }

    function removeVest(address token)
        public
        authorized
    {
        require(vests[token].amount > 0, "Vest not exsit");
        delete vests[token];
    }

    function hasVest(address token) public view returns(bool) {
        return (vests[token].amount > 0);
    }

    function unlockedVest(address token)
        public
        view
        returns(uint256)
    {
        require(hasVest(token), "Vest plan not found");
        /* solium-disable-next-line security/no-block-members */
        uint256 timeNow = block.timestamp;
        Vest memory vest = vests[token];
        if (timeNow < vest.startDate) {
            // Not started yet
            return 0;
        }
        uint256 dt = timeNow - vest.startDate;
        return 1 + dt / vest.interval;  // the first round happens right after it starts
    }

    function availableVest(address token)
        public
        view
        returns(uint256 numVests)
    {
        require(hasVest(token), "Vest plan doesn't exist");
        uint256 sent = vests[token].numVestSent;
        uint256 unlocked = unlockedVest(token);
        return unlocked - sent;
    }

    function getBalance(address token) public view returns(uint256) {
        if (token == address(0)) {
            return address(manager).balance;
        } else {
            return IERC20(token).balanceOf(address(manager));
        }
    }

    /// @dev Transfer all the vested token / coins.
    /// @param token Address of the token that should be transfered (0 for Ether)
    function execute(address token)
        public
    {
        require(hasVest(token), "Vest plan not found");
        uint256 numAvailable = availableVest(token);
        Vest memory vest = vests[token];
        address to = vest.to;
        uint256 availableToSend = numAvailable * vest.amount;
        uint256 balance = getBalance(token);
        uint256 amount = Math.min(balance, availableToSend);
        require(amount > 0, "No available vest");

        emit TransferVested(token, amount, numAvailable, block.timestamp);
        vests[token].numVestSent += numAvailable;
        if (token == address(0)) {
            require(manager.execTransactionFromModule(to, amount, "", Enum.Operation.Call), "Could not execute ether transfer");
        } else {
            bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", to, amount);
            require(manager.execTransactionFromModule(token, 0, data, Enum.Operation.Call), "Could not execute token transfer");
        }
    }
}
