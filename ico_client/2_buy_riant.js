const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const {Token, ASSOCIATED_TOKEN_PROGRAM_ID} = require("@solana/spl-token");
const TokenUtils = require("./token_utils");
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

  const {key, beneficiary, icoPool, imprint} = await program.state();
  const mint = new anchor.web3.PublicKey(config.token);
  console.log('key: ', key.toString())
  console.log('beneficiary: ', beneficiary.toString())
  console.log('buyerSolWallet: ', provider.wallet.publicKey.toString());
  console.log('buyerSolWallet balance: ', await utils.balance(provider.wallet.publicKey));

  let a = await provider.connection.getAccountInfo(provider.wallet.publicKey);
  console.log(a);

  const amount = new anchor.BN(10 * tokenInLamport);

  console.log('owner: ', owner.toString())
  console.log('mint: ', mint.toString())

  const buyerTokenWallet = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TokenInstructions.TOKEN_PROGRAM_ID,
    mint,
    owner
  )

  console.log('vault: ', buyerTokenWallet.toString())

  try {

    const tx = await program.rpc.buy(
      amount,
      {
        accounts: {
          icoContract: key,
          icoImprint: imprint,
          icoPool,
          beneficiary,
          buyerSolWallet: provider.wallet.publicKey,
          buyerAuthority: provider.wallet.publicKey,
          buyerTokenWallet,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        }
      });
    console.log("tx: ", tx);
  } catch (e) {
    console.log("Purchase RIANT error due to: ", e);
  }
}

purchase_riant().then(() => console.log('Success'));