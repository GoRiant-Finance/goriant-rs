const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const serumCmn = require("@project-serum/common");
const utils = require("./utils");
const config = utils.readConfig();
const provider = utils.provider;
const program_id = new anchor.web3.PublicKey(config.programId);
anchor.setProvider(provider);
const idl = utils.readIdl();
let program = new anchor.Program(idl, program_id);
const tokenInLamport = anchor.web3.LAMPORTS_PER_SOL;

const owner = provider.wallet.publicKey;

async function purchase_riant() {

  // buy (SOL)
  // 4. buyer wallet => my wallet send SOL đến ICO program
  // 5. amount SOL * 20
  // 6. dispatch RIANT
  // 7. SOL của buyer sẽ chuyển thẳng vào SOL Wallet của anh

  try {

    await anchor.web3.transfer();

  } catch (e) {
    console.log("ICO Pool has been initialized: ", e);
  }
}

purchase_riant().then(() => console.log('Success'));