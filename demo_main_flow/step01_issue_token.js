const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");

const provider = anchor.Provider.local('https://api.devnet.solana.com');

anchor.setProvider(provider);

async function step01_issue_token() {
  const [mint, god] = await serumCmn.createMintAndVault(
    provider,
    new anchor.BN(1000000)
  );

  console.log("Token address: ", mint.toBase58())
  console.log("Vault address: ", god.toBase58())
}

step01_issue_token()