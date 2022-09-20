const { getNamedAccounts, ethers } = require("hardhat");
const { getWeth, DEPOSIT_AMOUNT } = require("./getWeth");

const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

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

    // borrow
    console.log("------------------------------------------");
    console.log("[BORROW_ASSETS]");
    console.log("Loading borrowing stats...");
    const { totalDebtETH, availableBorrowsETH } = await getBorrowUserData(deployer, lendingPool);

    await getDaiPrice();
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

const approveERC20 = async (erc20Address, spenderAddress, amtToSpend, account) => {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account);
    console.log("Approving lending pool to use balance from account...");
    const tx = await erc20Token.approve(spenderAddress, amtToSpend);
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
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    );

    const price = (await daiETHPriceFeed.latestRoundData())[1];
    console.log(`The DAI/ETH price is ${price.toString()}`);

    return price;
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
