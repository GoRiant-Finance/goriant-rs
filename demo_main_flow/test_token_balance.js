const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");

const provider = anchor.Provider.local('https://api.devnet.solana.com');

anchor.setProvider(provider);

async function token_balance() {

  const w = await new anchor.web3.PublicKey("EquB1v4dK1duZH2nrmZPLz5ih39QuNA3eFiJojM1rktd");
  let balance = await provider.connection.getTokenAccountBalance(w);

  console.log("balance: ", balance.value);
}

token_balance()