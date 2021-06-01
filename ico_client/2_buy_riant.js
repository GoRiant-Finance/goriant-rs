const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const Token = require("@solana/spl-token");
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

async function sendSol(receiver, amount) {
  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: receiver,
      lamports: amount,
    }),
  );

  await provider.connection.sendTransaction(tx, [provider.wallet.payer]);

  await utils.sleep(1000);
}


async function purchase_riant() {

  const {key, beneficiary} = await program.state();


  const buyerSolWallet = await serumCmn.createTokenAccount(
    provider,
    Token.NATIVE_MINT,
    provider.wallet.publicKey
  );

  await sendSol(buyerSolWallet, 1 * tokenInLamport);

  console.log('key: ', key.toString())
  console.log('beneficiary: ', beneficiary.toString())
  console.log('buyerSolWallet: ', buyerSolWallet.toString());
  console.log('buyerSolWallet balance: ', await utils.balance(buyerSolWallet));

  const amount = new anchor.BN(1000000);
  const nonce = 3;
  try {

    const tx = await program.rpc.buy(
      owner,
      amount,
      nonce,
      {
        accounts: {
          icoContract: key,
          buyerSolWallet,
          beneficiary,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        }
      });

    console.log("transferred SOL to Seller");

  } catch (e) {
    console.log("Purchase RIANT error due to: ", e);
  }
}

purchase_riant().then(() => console.log('Success'));