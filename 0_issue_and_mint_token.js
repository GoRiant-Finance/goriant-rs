const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const utils = require("./utils");
const config = utils.readConfig();
const provider = utils.provider;
anchor.setProvider(provider);

async function issue_and_mint_token() {
  const [mint, god] = await serumCmn.createMintAndVault(
    provider,
    new anchor.BN(1000000)
  );

  config.token = mint.toBase58();
  config.vault = god.toBase58();
  utils.writeConfig(config);

  console.log("mint: ", mint.toString());
  console.log("god: ", god.toString());
}

issue_and_mint_token().then(() => console.log('Success'));