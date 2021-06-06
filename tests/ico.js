const { expect } = require("chai");
const anchor = require("@project-serum/anchor");
const {TokenInstructions} = require("@project-serum/serum");
const serumCmn = require("@project-serum/common");
const {LAMPORTS_PER_SOL} = require("@solana/web3.js");
const {ASSOCIATED_TOKEN_PROGRAM_ID, Token} = require("@solana/spl-token");

describe("test ico program", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Ico;
  const owner = provider.wallet.publicKey;
  let mint;

  describe("Init Riant ICO pool", () => {

    it("test init Riant ICO program", async () => {

      // given
      const [_mint, god] = await serumCmn.createMintAndVault(
        provider,
        new anchor.BN(1_000_000 * LAMPORTS_PER_SOL),
        owner, 9);

      mint = _mint;

      const statePubKey = await program.state.address();
      const start = new anchor.BN(new Date().getTime() / 1000);// + 0.5 * minuteInSecond);
      const cap = 10_000; // raising 10,000 SOL
      const rate = 20; // 1 SOL = 20 RIANT

      const icoPool = new anchor.web3.Keypair();
      const [icoPoolImprint, nonce] = await anchor.web3.PublicKey.findProgramAddress(
        [statePubKey.toBuffer()],
        program.programId
      );

      // when
      let tx = await program.state.rpc.new(
        statePubKey,
        nonce,
        start,
        cap,
        rate,
        {
          accounts: {
            authority: owner,
            depositor: god,
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

      // then

      let state = await program.state();

      expect(tx).to.exist;
      expect(state.key).to.eql(statePubKey);
      expect(state.initialized).to.be.true;
      expect(state.start).to.eql(start);
      expect(state.raisedAmount).to.equal(0);
      expect(state.cap.toString()).to.equal('10000');
      expect(state.rate.toString()).to.equal('20');
      expect(state.owner).to.eql(owner);
      expect(state.beneficiary).to.eql(owner);
      expect(state.icoPool).not.to.be.null;
    });
  })

  describe("Airdrop", () => {

    it("Test airdrop", async () => {

      // given
      const {key, beneficiary, icoPool, imprint} = await program.state();
      const amount = new anchor.BN(10 * LAMPORTS_PER_SOL);

      const clientWallet = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TokenInstructions.TOKEN_PROGRAM_ID,
        mint,
        owner
      )

      // when
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
            buyerTokenWallet: clientWallet,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId
          },
          instructions: [
            Token.createAssociatedTokenAccountInstruction(
              ASSOCIATED_TOKEN_PROGRAM_ID,
              TokenInstructions.TOKEN_PROGRAM_ID,
              mint,
              clientWallet,
              owner,
              owner
            )
          ]
        });

      // then
      const icoPoolBalance = await provider.connection.getTokenAccountBalance(icoPool)
      const riantBalance = await provider.connection.getTokenAccountBalance(clientWallet)
      expect(tx).to.exist;
      expect(riantBalance.value.uiAmount.toString(), "Client Riant balace should be 200 after claim airdrop").to.equal("200");
      expect(icoPoolBalance.value.uiAmount.toString(), "ICO Pool should remain 199,800 RIANT").to.equal("199800");
    })
  })

});

