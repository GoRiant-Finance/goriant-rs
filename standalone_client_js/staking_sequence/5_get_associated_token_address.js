const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const serumCmn = require("@project-serum/common");
const utils = require("./utils");
const { ASSOCIATED_TOKEN_PROGRAM_ID, Token } = require('@solana/spl-token')
const config = utils.readConfig();
const provider = utils.provider;
const program_id = new anchor.web3.PublicKey(config.programId);
anchor.setProvider(provider);
const idl = utils.readIdl();
let program = new anchor.Program(idl, program_id);
const tokenInLamport = anchor.web3.LAMPORTS_PER_SOL;

async function main() {

  const owner = provider.wallet.publicKey
  const mint = new anchor.web3.PublicKey(`eC35AJXZv5crc6pYPmmMesnZS5o4dJFaeCyuvSH4RF5`)
  console.log('getAssociatedTokenAddress for owner: ',
    owner.toString(),
    ' by mint: ',
    mint.toString())
  const associatedAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TokenInstructions.TOKEN_PROGRAM_ID,
    mint,
    owner
  )

  console.log('associatedAddress: ', associatedAddress.toString())

}

main().then(() => console.log('Success'));