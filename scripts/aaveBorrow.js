const { getNamedAccounts } = require("hardhat");
const { getWeth } = require("./getWeth");

const main = async () => {
    await getWeth();
    const { deployer } = getNamedAccounts();

    // Lending Pool Address Provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    // Lending Pool Address: get from the provider above
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
