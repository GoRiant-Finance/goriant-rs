# Goriant Rust - Solana Blockchain

## Flexible staking program and pending reward calculation real time

### Guide to run local dev

- run solana test validator local

```
    nohup solana-test-validator -r &
```

- build & deploy to local net

```  
    anchor build && anchor deploy    
```

- run integration tests

```
    anchor test
```

### Tech stack:
- anchor 0.6.0
- mocha
- chaijs
    

#### setup DEV ENV anchor
        
        https://project-serum.github.io/anchor/getting-started/installation.html