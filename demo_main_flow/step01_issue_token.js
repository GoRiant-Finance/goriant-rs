const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");

const provider = anchor.Provider.local('https://api.devnet.solana.com');

anchor.setProvider(provider);

async function issue_token_and_mint_1_millions() {
  const [mint, god] = await serumCmn.createMintAndVault(
    provider,
    new anchor.BN(1000000)
  );

  console.log("Token address: ", mint.toBase58())
  console.log("Vault address: ", god.toBase58())
}

issue_token_and_mint_1_millions().then(r => console.log(r) )