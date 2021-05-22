const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const utils = require("./utils");

const provider = anchor.Provider.local('https://api.devnet.solana.com');

anchor.setProvider(provider);

async function issue_token_and_mint_1_millions() {

  const [mint, god] = await serumCmn.createMintAndVault(
    provider,
    new anchor.BN(1000000)
  );

  let tokenBalance = await utils.tokenBalance(god.toBase58());

  console.log("Owner address: ", provider.wallet.publicKey.toBase58());

  console.log("Token address: ", mint.toBase58());
  console.log("Vault address: ", god.toBase58(), " - ",
    tokenBalance.value.amount
  );

  let config = await utils.readConfig();
  config.token = mint.toBase58();
  config.vault = god.toBase58();

  await utils.writeConfig(config);
}

issue_token_and_mint_1_millions().then(() => console.log("Issue token done"));