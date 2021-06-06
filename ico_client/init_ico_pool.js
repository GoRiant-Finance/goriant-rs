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

/**
 * Raise 10_000 SOL by selling 200_000 RIANT
 */
async function init_riant_ico() {

    const mint = new anchor.web3.PublicKey(config.token)
    const god = new anchor.web3.PublicKey(config.vault)

    try {

        const statePubKey = await program.state.address();
        const start = new anchor.BN(new Date().getTime() / 1000);
        const cap = 10_000; // raising 10,000 SOL
        const rate = 20; // 1 SOL = 20 RIANT
        const depositor = god;

        const icoPool = new anchor.web3.Keypair();
        const [icoPoolImprint, nonce] = await anchor.web3.PublicKey.findProgramAddress(
            [statePubKey.toBuffer()],
            program.programId
        );

        let tx = await program.state.rpc.new(
            statePubKey,
            nonce,
            start,
            cap,
            rate,
            {
                accounts: {
                    authority: owner,
                    depositor,
                    icoPool: icoPool.publicKey,
                    tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY
                },
                signers: [icoPool],
                instructions:
                    [
                        ...(await serumCmn.createTokenAccountInstrs(
                            provider,
                            icoPool.publicKey,
                            mint,
                            icoPoolImprint
                        ))
                    ]
            }
        );
        console.log("tx id: ", tx);
    } catch (e) {
        console.log("ICO Pool has been initialized: ", e);
    }
}

init_riant_ico().then(() => console.log('Success'));