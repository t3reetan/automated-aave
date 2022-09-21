const { getNamedAccounts, ethers } = require("hardhat");
const { getWeth, DEPOSIT_AMOUNT } = require("./getWeth");

const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const aggregatorV3InterfaceABI = require("@chainlink/contracts/abi/v0.8/AggregatorV3Interface.json");
const { BigNumber } = require("ethers");

// only want to use 95% of our available collateral to borrow (depends on how much you want to use)
// it's best to not use 100% of your collateral as you could get instantly liquidated due to market volatility
// for more information about liquidation on Aave, read https://docs.aave.com/faq/liquidations#introduction
const BORROW_PERCENTAGE = 0.95;

const main = async () => {
    const { deployer } = await getNamedAccounts();

    await getWeth(deployer);

    // Lending Pool Address Provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    // Lending Pool Address: get from the provider above
    const lendingPool = await getLendingPool(deployer);

    console.log("------------------------------------------");
    console.log("[DEPOSIT_COLLATERAL]");

    // to deposit, we'll need to approve the lending pool on aave to use WETH tokens from our account
    await approveERC20(wethTokenAddress, lendingPool.address, DEPOSIT_AMOUNT, deployer);

    console.log("Depositing ", ethers.utils.formatUnits(DEPOSIT_AMOUNT), " WETH...");

    await lendingPool.deposit(wethTokenAddress, DEPOSIT_AMOUNT, deployer, 0);
    console.log(
        ethers.utils.formatUnits(DEPOSIT_AMOUNT),
        " WETH deposited into the aave lending pool(",
        lendingPool.address,
        ")."
    );

    console.log("------------------------------------------");
    console.log("[BORROW_ASSETS]");
    console.log("Loading borrowing stats...");
    const { totalDebtETH, availableBorrowsETH } = await getBorrowUserData(deployer, lendingPool);

    const daiPriceInEth = await getDaiPrice();

    const amountDaiToBorrow =
        (availableBorrowsETH.toString() * BORROW_PERCENTAGE) / daiPriceInEth.toString();

    console.log(
        `Amount of DAI we want to borrow: ${amountDaiToBorrow} (${BORROW_PERCENTAGE * 100}%)`
    );

    // we need the amount of DAI to borrow in wei to ...
    const amountDaiToBorrowInWei = ethers.utils.parseEther(amountDaiToBorrow.toString()); // gives you 10**18

    await borrowDai(lendingPool, daiTokenAddress, amountDaiToBorrowInWei, deployer);

    console.log("------------------------------------------");
    console.log("[REPAY_ASSETS]");
    await repayLoan(
        daiTokenAddress,
        lendingPool,
        amountDaiToBorrowInWei.div(BigNumber.from(2)), // repay half
        deployer
    );
};

const getLendingPool = async (account) => {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        account
    );

    const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool();

    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account);

    return lendingPool;
};

const approveERC20 = async (erc20Address, spenderAddress, amountToSpend, account) => {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account);
    console.log("Approving lending pool to use balance from account...");
    const tx = await erc20Token.approve(spenderAddress, amountToSpend);
    await tx.wait(1);
    console.log("Approved.");
};

const getBorrowUserData = async (account, lendingPool) => {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account);

    console.log("Borrowing stats:");
    console.log(
        "You have ",
        ethers.utils.formatUnits(totalCollateralETH),
        " ETH worth of assets locked as collateral."
    );
    console.log("You have ", ethers.utils.formatUnits(totalDebtETH), " ETH worth of debt.");
    console.log(
        "You can borrow ",
        ethers.utils.formatUnits(availableBorrowsETH),
        " ETH worth of assets based on your deposited collateral."
    );

    return { totalDebtETH, availableBorrowsETH };
};

const getDaiPrice = async () => {
    // not going to provide a signer here as we're just reading data, don't need to sign txs
    const daiETHPriceFeed = await ethers.getContractAt(
        aggregatorV3InterfaceABI,
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    );

    const price = (await daiETHPriceFeed.latestRoundData())[1];
    console.log(`The DAI/ETH price is ${ethers.utils.formatUnits(price)}`);

    return price;
};

const borrowDai = async (lendingPool, daiTokenAddress, amountToBorrow, account) => {
    const borrowTx = await lendingPool.borrow(daiTokenAddress, amountToBorrow, 2, 0, account);
    await borrowTx.wait(1);
    console.log(`You've successfully borrowed ${ethers.utils.formatUnits(amountToBorrow)} DAI`);
    console.log("------------------------------------------");

    // get our updated Borrowing stats
    console.log("Getting updated borrowing stats after borrowing...");
    await getBorrowUserData(account, lendingPool);
};

const repayLoan = async (daiTokenAddress, lendingPool, amountToRepay, account) => {
    await approveERC20(daiTokenAddress, lendingPool.address, amountToRepay, account);
    const repayTx = await lendingPool.repay(daiTokenAddress, amountToRepay, 2, account);
    await repayTx.wait(1);
    console.log(`You've repaid ${ethers.utils.formatUnits(amountToRepay)} DAI`);
    console.log("------------------------------------------");

    // get our updated Borrowing stats
    console.log("Getting updated borrowing stats after repaying...");
    await getBorrowUserData(account, lendingPool);
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
