import { web3, Program, BN, Provider, Wallet } from "@project-serum/anchor";
import { SystemProgram } from "@solana/web3.js";

import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { ITEM_ID, TOKEN_PROGRAM_ID } from "../constants/programIds";
import { AnchorPermissivenessType } from "../state/common";
import { decodeItemClass, ItemClass } from "../state/item";
import {
  getAtaForMint,
  getCraftItemCounter,
  getCraftItemEscrow,
  getEdition,
  getItemEscrow,
  getItemPDA,
  getMetadata,
} from "../utils/pda";
import {
  generateRemainingAccountsForCreateClass,
  generateRemainingAccountsGivenPermissivenessToUse,
  ObjectWrapper,
} from "./common";
import log from "loglevel";
import { getCluster } from "../utils/connection";
import { Token } from "@solana/spl-token";
import { sendTransactionWithRetry } from "../utils/transactions";

function convertNumsToBNs(data: any) {
  if (data.itemClassData) {
    data.itemClassData.config.usages?.forEach((k) => {
      let u = k.itemClassType.consumable;
      if (u) {
        if (u.maxUses != null) u.maxUses = new BN(u.maxUses);
        if (u.maxPlayersPerUse != null)
          u.maxPlayersPerUse = new BN(u.maxPlayersPerUse);
        if (u.warmupDuration != null)
          u.warmupDuration = new BN(u.warmupDuration);
        if (u.cooldownDuration != null) {
          u.cooldownDuration = new BN(u.cooldownDuration);
        }
      }

      u = k.itemClassType.wearable;
      if (u) {
        if (u.limitPerPart) {
          u.limitPerPart = new BN(u.limitPerPart);
        }
      }
    });
  }
}
export class ItemClassWrapper implements ObjectWrapper<ItemClass, ItemProgram> {
  program: ItemProgram;
  key: web3.PublicKey;
  object: ItemClass;
  data: Buffer;
  classIndex: number;

  constructor(args: {
    program: ItemProgram;
    key: web3.PublicKey;
    object: ItemClass;
    data: Buffer;
  }) {
    this.program = args.program;
    this.key = args.key;
    this.object = args.object;
    this.data = args.data;
  }
}

export interface CreateItemClassArgs {
  itemClassBump: number | null;
  classIndex: BN;
  parentClassIndex: null | BN;
  space: BN;
  desiredNamespaceArraySize: number;
  updatePermissivenessToUse: null | AnchorPermissivenessType;
  storeMint: boolean;
  storeMetadataFields: boolean;
  itemClassData: any;
}

export interface CreateItemEscrowArgs {
  craftBump: number | null;
  classIndex: BN;
  craftEscrowIndex: BN;
  componentScope: String;
  amountToMake: BN;
  namespaceIndex: BN | null;
  buildPermissivenessToUse: null | AnchorPermissivenessType;
  itemClassMint: web3.PublicKey;
}

export interface AddCraftItemToEscrowArgs {
  tokenBump: number | null;
  classIndex: BN;
  craftItemIndex: BN;
  craftEscrowIndex: BN;
  craftItemClassIndex: BN;
  craftItemClassMint: web3.PublicKey;
  craftItemCounterBump: number | null;
  componentScope: String;
  amountToMake: BN;
  amountToContributeFromThisContributor: BN;
  newItemMint: web3.PublicKey;
  originator: web3.PublicKey;
  namespaceIndex: BN | null;
  buildPermissivenessToUse: null | AnchorPermissivenessType;
  itemClassMint: web3.PublicKey;
  componentProof: web3.PublicKey | null;
  // we use any bcause of the enum changes required
  // means redefining all these interfaces for anchor
  // too lazy
  component: any | null;
  craftUsageInfo: {
    craftUsageStateProof: web3.PublicKey;
    craftUsageState: {
      index: number;
      uses: BN;
      activatedAt: BN | null;
    };
    craftUsageProof: web3.PublicKey;
    craftUsage: any;
  } | null;
}

export interface RemoveCraftItemFromEscrowArgs {
  tokenBump: number | null;
  craftItemTokenMint: web3.PublicKey;
  classIndex: BN;
  craftItemIndex: BN;
  craftEscrowIndex: BN;
  craftItemCounterBump: number | null;
  craftItemClassIndex: BN;
  craftItemClassMint: web3.PublicKey;
  componentScope: String;
  amountToMake: BN;
  amountContributedFromThisContributor: BN;
  newItemMint: web3.PublicKey;
  originator: web3.PublicKey;
  namespaceIndex: BN | null;
  buildPermissivenessToUse: null | AnchorPermissivenessType;
  itemClassMint: web3.PublicKey;
  componentProof: web3.PublicKey | null;
  // we use any bcause of the enum changes required
  // means redefining all these interfaces for anchor
  // too lazy
  component: any | null;
}

export interface StartItemEscrowBuildPhaseArgs {
  classIndex: BN;
  craftEscrowIndex: BN;
  componentScope: String;
  amountToMake: BN;
  itemClassMint: web3.PublicKey;
  originator: web3.PublicKey;
  newItemMint: web3.PublicKey;
  buildPermissivenessToUse: null | AnchorPermissivenessType;
  endNodeProof: web3.PublicKey | null;
  totalSteps: BN | null;
}

export interface CompleteItemEscrowBuildPhaseArgs {
  classIndex: BN;
  newItemBump: number;
  newItemIndex: BN;
  craftEscrowIndex: BN;
  componentScope: String;
  amountToMake: BN;
  space: BN;
  itemClassMint: web3.PublicKey;
  originator: web3.PublicKey;
  buildPermissivenessToUse: null | AnchorPermissivenessType;
  storeMint: boolean;
  storeMetadataFields: boolean;
}

export interface DeactivateItemEscrowArgs {
  classIndex: BN;
  craftEscrowIndex: BN;
  componentScope: String;
  amountToMake: BN;
  itemClassMint: web3.PublicKey;
  newItemMint: web3.PublicKey;
  newItemToken: web3.PublicKey;
}

export interface DrainItemEscrowArgs {
  classIndex: BN;
  craftEscrowIndex: BN;
  componentScope: String;
  amountToMake: BN;
  itemClassMint: web3.PublicKey;
  newItemMint: web3.PublicKey;
  newItemToken: web3.PublicKey;
}

export interface UpdateItemClassArgs {
  classIndex: BN;
  updatePermissivenessToUse: null | AnchorPermissivenessType;
  itemClassData: any | null;
}

export interface UpdateItemArgs {
  classIndex: BN;
  index: BN;
  itemMint: web3.PublicKey;
  itemClassMint: web3.PublicKey;
}

export interface CreateItemClassAccounts {
  itemMint: web3.PublicKey;
  parent: web3.PublicKey | null;
  parentMint: web3.PublicKey | null;
  parentOfParentClassMint: web3.PublicKey | null;
  metadataUpdateAuthority: web3.PublicKey | null;
  parentUpdateAuthority: web3.PublicKey | null;
}

export interface CreateItemEscrowAccounts {
  itemClassMint: web3.PublicKey;
  newItemMint: web3.PublicKey;
  newItemToken: web3.PublicKey | null;
  newItemTokenHolder: web3.PublicKey | null;
  parentMint: web3.PublicKey | null;
  metadataUpdateAuthority: web3.PublicKey | null;
}

export interface AddCraftItemToEscrowAccounts {
  itemClassMint: web3.PublicKey;
  newItemToken: web3.PublicKey | null;
  newItemTokenHolder: web3.PublicKey | null;
  craftItemTokenMint: web3.PublicKey | null;
  parentMint: web3.PublicKey | null;
  metadataUpdateAuthority: web3.PublicKey | null;
}
export interface RemoveCraftItemFromEscrowAccounts {
  itemClassMint: web3.PublicKey;
  newItemToken: web3.PublicKey | null;
  newItemTokenHolder: web3.PublicKey | null;
  parentMint: web3.PublicKey | null;
  metadataUpdateAuthority: web3.PublicKey | null;
}

export interface CompleteItemEscrowBuildPhaseAccounts {
  itemClassMint: web3.PublicKey;
  newItemMint: web3.PublicKey;
  newItemToken: web3.PublicKey | null;
  newItemTokenHolder: web3.PublicKey | null;
  parentMint: web3.PublicKey | null;
  metadataUpdateAuthority: web3.PublicKey | null;
}

export interface DeactivateItemEscrowAccounts {}

export interface DrainItemEscrowAccounts {
  originator: web3.PublicKey | null;
}

export interface UpdateItemClassAccounts {
  itemMint: web3.PublicKey;
  parent: web3.PublicKey | null;
  parentMint: web3.PublicKey | null;
  metadataUpdateAuthority: web3.PublicKey | null;
}

export interface UpdateItemAccounts {}

export interface StartItemEscrowBuildPhaseAccounts {
  itemClassMint: web3.PublicKey;
  newItemToken: web3.PublicKey | null;
  newItemTokenHolder: web3.PublicKey | null;
  parentMint: web3.PublicKey | null;
  metadataUpdateAuthority: web3.PublicKey | null;
}

export interface CreateItemClassAdditionalArgs {
  parentOfParentClassIndex: BN | null;
}

export interface UpdateItemClassAdditionalArgs {
  parentClassIndex: BN | null;
}

export interface CreateItemEscrowAdditionalArgs {
  parentClassIndex: BN | null;
}

export interface StartItemEscrowBuildPhaseAdditionalArgs {
  parentClassIndex: BN | null;
}
export interface CompleteItemEscrowBuildPhaseAdditionalArgs {
  parentClassIndex: BN | null;
}

export interface UpdateItemAdditionalArgs {}
export interface AddCraftItemToEscrowAdditionalArgs {
  parentClassIndex: BN | null;
}
export interface RemoveCraftItemFromEscrowAdditionalArgs {
  parentClassIndex: BN | null;
}

export interface DeactivateItemEscrowAdditionalArgs {}

export interface DrainItemEscrowAdditionalArgs {}

export class ItemProgram {
  id: web3.PublicKey;
  program: Program;

  constructor(args: { id: web3.PublicKey; program: Program }) {
    this.id = args.id;
    this.program = args.program;
  }

  async fetchItemClass(
    mint: web3.PublicKey,
    index: BN
  ): Promise<ItemClassWrapper> {
    let itemClass = (await getItemPDA(mint, index))[0];

    // Need a manual deserializer due to our hack we had to do.
    let itemClassObj = await this.program.provider.connection.getAccountInfo(
      itemClass
    );

    const ic = decodeItemClass(itemClassObj.data);
    ic.program = this.program;

    return new ItemClassWrapper({
      program: this,
      key: itemClass,
      data: itemClassObj.data,
      object: ic,
    });
  }

  async createItemEscrow(
    args: CreateItemEscrowArgs,
    accounts: CreateItemEscrowAccounts,
    additionalArgs: CreateItemEscrowAdditionalArgs
  ) {
    const remainingAccounts =
      await generateRemainingAccountsGivenPermissivenessToUse({
        permissivenessToUse: args.buildPermissivenessToUse,
        tokenMint: accounts.itemClassMint,
        parentMint: accounts.parentMint,
        parentIndex: additionalArgs.parentClassIndex,
        parent: accounts.parentMint
          ? (
              await getItemPDA(
                accounts.parentMint,
                additionalArgs.parentClassIndex
              )
            )[0]
          : null,
        metadataUpdateAuthority: accounts.metadataUpdateAuthority,
        program: this.program,
      });

    const itemClassKey = (
      await getItemPDA(accounts.itemClassMint, args.classIndex)
    )[0];

    const [itemEscrow, itemEscrowBump] = await getItemEscrow({
      itemClassMint: accounts.itemClassMint,
      craftEscrowIndex: args.craftEscrowIndex,
      classIndex: args.classIndex,
      newItemMint: accounts.newItemMint,
      newItemToken:
        accounts.newItemToken ||
        (
          await getAtaForMint(
            accounts.newItemMint,
            this.program.provider.wallet.publicKey
          )
        )[0],
      payer: this.program.provider.wallet.publicKey,
      amountToMake: args.amountToMake,
      componentScope: args.componentScope,
    });

    args.craftBump = itemEscrowBump;
    await this.program.rpc.createItemEscrow(args, {
      accounts: {
        itemClass: itemClassKey,
        itemClassMetadata: await getMetadata(accounts.itemClassMint),
        newItemMint: accounts.newItemMint,
        newItemMetadata: await getMetadata(accounts.newItemMint),
        newItemEdition: await getEdition(accounts.newItemMint),
        itemEscrow,
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              accounts.newItemMint,
              this.program.provider.wallet.publicKey
            )
          )[0],
        newItemTokenHolder:
          accounts.newItemTokenHolder || this.program.provider.wallet.publicKey,
        payer: this.program.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
      remainingAccounts:
        remainingAccounts.length > 0 ? remainingAccounts : undefined,
    });
  }

  async completeItemEscrowBuildPhase(
    args: CompleteItemEscrowBuildPhaseArgs,
    accounts: CompleteItemEscrowBuildPhaseAccounts,
    additionalArgs: CompleteItemEscrowBuildPhaseAdditionalArgs
  ) {
    const remainingAccounts =
      await generateRemainingAccountsGivenPermissivenessToUse({
        permissivenessToUse: args.buildPermissivenessToUse,
        tokenMint: accounts.itemClassMint,
        parentMint: accounts.parentMint,
        parentIndex: additionalArgs.parentClassIndex,
        parent: accounts.parentMint
          ? (
              await getItemPDA(
                accounts.parentMint,
                additionalArgs.parentClassIndex
              )
            )[0]
          : null,
        metadataUpdateAuthority: accounts.metadataUpdateAuthority,
        program: this.program,
      });

    const itemClassKey = (
      await getItemPDA(accounts.itemClassMint, args.classIndex)
    )[0];

    const [newItem, newItemBump] = await getItemPDA(
      accounts.newItemMint,
      args.newItemIndex
    );

    args.newItemBump = newItemBump;

    const itemEscrow = (
      await getItemEscrow({
        itemClassMint: accounts.itemClassMint,
        classIndex: args.classIndex,
        craftEscrowIndex: args.craftEscrowIndex,
        newItemMint: accounts.newItemMint,
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              accounts.newItemMint,
              args.originator || this.program.provider.wallet.publicKey
            )
          )[0],
        payer: args.originator || this.program.provider.wallet.publicKey,
        amountToMake: args.amountToMake,
        componentScope: args.componentScope,
      })
    )[0];

    await this.program.rpc.completeItemEscrowBuildPhase(args, {
      accounts: {
        itemClass: itemClassKey,
        itemEscrow,
        newItem,
        newItemMint: accounts.newItemMint,
        newItemMetadata: await getMetadata(accounts.newItemMint),
        newItemEdition: await getEdition(accounts.newItemMint),
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              accounts.newItemMint,
              args.originator || this.program.provider.wallet.publicKey
            )
          )[0],
        newItemTokenHolder:
          accounts.newItemTokenHolder ||
          args.originator ||
          this.program.provider.wallet.publicKey,
        payer: this.program.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
      },
      remainingAccounts:
        remainingAccounts.length > 0 ? remainingAccounts : undefined,
    });
  }

  async deactivateItemEscrow(
    args: DeactivateItemEscrowArgs,
    _accounts: DeactivateItemEscrowAccounts,
    _additionalArgs: DeactivateItemEscrowAdditionalArgs
  ) {
    args.newItemToken =
      args.newItemToken ||
      (
        await getAtaForMint(
          args.newItemMint,
          this.program.provider.wallet.publicKey
        )
      )[0];
    const itemEscrow = (
      await getItemEscrow({
        itemClassMint: args.itemClassMint,
        classIndex: args.classIndex,
        craftEscrowIndex: args.craftEscrowIndex,
        newItemMint: args.newItemMint,
        newItemToken: args.newItemToken,
        payer: this.program.provider.wallet.publicKey,
        amountToMake: args.amountToMake,
        componentScope: args.componentScope,
      })
    )[0];

    await this.program.rpc.deactivateItemEscrow(args, {
      accounts: {
        itemEscrow,
        originator: this.program.provider.wallet.publicKey,
      },
    });
  }

  async addCraftItemToEscrow(
    args: AddCraftItemToEscrowArgs,
    accounts: AddCraftItemToEscrowAccounts,
    additionalArgs: AddCraftItemToEscrowAdditionalArgs
  ) {
    const remainingAccounts =
      await generateRemainingAccountsGivenPermissivenessToUse({
        permissivenessToUse: args.buildPermissivenessToUse,
        tokenMint: accounts.itemClassMint,
        parentMint: accounts.parentMint,
        parentIndex: additionalArgs.parentClassIndex,
        parent: accounts.parentMint
          ? (
              await getItemPDA(
                accounts.parentMint,
                additionalArgs.parentClassIndex
              )
            )[0]
          : null,
        metadataUpdateAuthority: accounts.metadataUpdateAuthority,
        program: this.program,
      });

    const itemClassKey = (
      await getItemPDA(accounts.itemClassMint, args.classIndex)
    )[0];
    const craftItemTokenAccount = (
      await getAtaForMint(
        accounts.craftItemTokenMint,
        this.program.provider.wallet.publicKey
      )
    )[0];

    const [craftItemEscrow, itemEscrowBump] = await getCraftItemEscrow({
      itemClassMint: accounts.itemClassMint,
      classIndex: args.classIndex,
      craftIndex: args.craftItemIndex,
      craftEscrowIndex: args.craftEscrowIndex,
      newItemMint: args.newItemMint,
      craftItemMint: accounts.craftItemTokenMint,
      craftItemToken: craftItemTokenAccount,
      payer: this.program.provider.wallet.publicKey,
      amountToMake: args.amountToMake,
      amountToContributeFromThisContributor:
        args.amountToContributeFromThisContributor,
      componentScope: args.componentScope,
    });

    const [craftItemCounter, craftBump] = await getCraftItemCounter({
      itemClassMint: accounts.itemClassMint,
      classIndex: args.classIndex,
      craftItemIndex: args.craftItemIndex,
      craftEscrowIndex: args.craftEscrowIndex,
      newItemMint: args.newItemMint,
      craftItemMint: accounts.craftItemTokenMint,
      componentScope: args.componentScope,
    });

    args.tokenBump = itemEscrowBump;
    args.craftItemCounterBump = craftBump;

    const itemEscrow = (
      await getItemEscrow({
        itemClassMint: accounts.itemClassMint,
        classIndex: args.classIndex,
        craftEscrowIndex: args.craftEscrowIndex,
        newItemMint: args.newItemMint,
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              args.newItemMint,
              args.originator || this.program.provider.wallet.publicKey
            )
          )[0],
        payer: args.originator || this.program.provider.wallet.publicKey,
        amountToMake: args.amountToMake,
        componentScope: args.componentScope,
      })
    )[0];

    const craftItem = (
      await getItemPDA(accounts.craftItemTokenMint, args.craftItemIndex)
    )[0];
    const craftItemObj = await this.program.account.item.fetch(craftItem);
    const instructions = [],
      signers = [];
    const craftItemTransferAuthority = web3.Keypair.generate();

    signers.push(craftItemTransferAuthority);
    instructions.push(
      Token.createApproveInstruction(
        TOKEN_PROGRAM_ID,
        craftItemTokenAccount,
        craftItemTransferAuthority.publicKey,
        this.program.provider.wallet.publicKey,
        [],
        args.amountToContributeFromThisContributor.toNumber()
      )
    );
    instructions.push(
      await this.program.instruction.addCraftItemToEscrow(args, {
        accounts: {
          itemClass: itemClassKey,
          itemEscrow,
          craftItemCounter,
          newItemToken:
            accounts.newItemToken ||
            (
              await getAtaForMint(
                args.newItemMint,
                args.originator || this.program.provider.wallet.publicKey
              )
            )[0],
          newItemTokenHolder:
            accounts.newItemTokenHolder ||
            args.originator ||
            this.program.provider.wallet.publicKey,
          craftItemTokenAccountEscrow: craftItemEscrow,
          craftItemTokenMint: accounts.craftItemTokenMint,
          craftItemTokenAccount,
          craftItem,
          craftItemClass: craftItemObj.parent,
          craftItemTransferAuthority: craftItemTransferAuthority.publicKey,
          payer: this.program.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: web3.SYSVAR_RENT_PUBKEY,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
        },
        remainingAccounts:
          remainingAccounts.length > 0 ? remainingAccounts : undefined,
      })
    );

    instructions.push(
      Token.createRevokeInstruction(
        TOKEN_PROGRAM_ID,
        craftItemTokenAccount,
        this.program.provider.wallet.publicKey,
        []
      )
    );

    await sendTransactionWithRetry(
      this.program.provider.connection,
      this.program.provider.wallet,
      instructions,
      signers
    );
  }

  async removeCraftItemFromEscrow(
    args: RemoveCraftItemFromEscrowArgs,
    accounts: RemoveCraftItemFromEscrowAccounts,
    additionalArgs: RemoveCraftItemFromEscrowAdditionalArgs
  ) {
    const remainingAccounts =
      await generateRemainingAccountsGivenPermissivenessToUse({
        permissivenessToUse: args.buildPermissivenessToUse,
        tokenMint: accounts.itemClassMint,
        parentMint: accounts.parentMint,
        parentIndex: additionalArgs.parentClassIndex,
        parent: accounts.parentMint
          ? (
              await getItemPDA(
                accounts.parentMint,
                additionalArgs.parentClassIndex
              )
            )[0]
          : null,
        metadataUpdateAuthority: accounts.metadataUpdateAuthority,
        program: this.program,
      });

    const itemClassKey = (
      await getItemPDA(accounts.itemClassMint, args.classIndex)
    )[0];
    const craftItemTokenAccount = (
      await getAtaForMint(
        args.craftItemTokenMint,
        this.program.provider.wallet.publicKey
      )
    )[0];

    const [craftItemEscrow, itemEscrowBump] = await getCraftItemEscrow({
      itemClassMint: accounts.itemClassMint,
      classIndex: args.classIndex,
      craftIndex: args.craftItemIndex,
      craftEscrowIndex: args.craftEscrowIndex,
      newItemMint: args.newItemMint,
      craftItemMint: args.craftItemTokenMint,
      craftItemToken: craftItemTokenAccount,
      payer: this.program.provider.wallet.publicKey,
      amountToMake: args.amountToMake,
      amountToContributeFromThisContributor:
        args.amountContributedFromThisContributor,
      componentScope: args.componentScope,
    });

    const [craftItemCounter, craftBump] = await getCraftItemCounter({
      itemClassMint: accounts.itemClassMint,
      classIndex: args.classIndex,
      craftItemIndex: args.craftItemIndex,
      craftEscrowIndex: args.craftEscrowIndex,
      newItemMint: args.newItemMint,
      craftItemMint: args.craftItemTokenMint,
      componentScope: args.componentScope,
    });

    args.tokenBump = itemEscrowBump;
    args.craftItemCounterBump = craftBump;

    const itemEscrow = (
      await getItemEscrow({
        itemClassMint: accounts.itemClassMint,
        classIndex: args.classIndex,
        craftEscrowIndex: args.craftEscrowIndex,
        newItemMint: args.newItemMint,
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              args.newItemMint,
              args.originator || this.program.provider.wallet.publicKey
            )
          )[0],
        payer: args.originator || this.program.provider.wallet.publicKey,
        amountToMake: args.amountToMake,
        componentScope: args.componentScope,
      })
    )[0];

    await this.program.rpc.removeCraftItemFromEscrow(args, {
      accounts: {
        itemClass: itemClassKey,
        itemEscrow,
        craftItemCounter,
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              args.newItemMint,
              args.originator || this.program.provider.wallet.publicKey
            )
          )[0],
        newItemTokenHolder:
          accounts.newItemTokenHolder ||
          args.originator ||
          this.program.provider.wallet.publicKey,
        craftItemTokenAccountEscrow: craftItemEscrow,
        craftItemTokenAccount,
        craftItem: (
          await getItemPDA(args.craftItemTokenMint, args.craftItemIndex)
        )[0],
        craftItemClass: (
          await getItemPDA(args.craftItemClassMint, args.craftItemClassIndex)
        )[0],
        receiver: this.program.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      remainingAccounts:
        remainingAccounts.length > 0 ? remainingAccounts : undefined,
    });
  }

  async drainItemEscrow(
    args: DrainItemEscrowArgs,
    accounts: DrainItemEscrowAccounts,
    _additionalArgs: DrainItemEscrowAdditionalArgs = {}
  ) {
    const itemClassKey = (
      await getItemPDA(args.itemClassMint, args.classIndex)
    )[0];

    if (!args.newItemToken) {
      args.newItemToken = (
        await getAtaForMint(
          args.newItemMint,
          this.program.provider.wallet.publicKey
        )
      )[0];
    }

    const itemEscrow = (
      await getItemEscrow({
        itemClassMint: args.itemClassMint,
        classIndex: args.classIndex,
        craftEscrowIndex: args.craftEscrowIndex,
        newItemMint: args.newItemMint,
        newItemToken: args.newItemToken,
        payer: this.program.provider.wallet.publicKey,
        amountToMake: args.amountToMake,
        componentScope: args.componentScope,
      })
    )[0];

    await this.program.rpc.drainItemEscrow(args, {
      accounts: {
        itemEscrow,
        originator: accounts.originator,
      },
    });
  }

  async startItemEscrowBuildPhase(
    args: StartItemEscrowBuildPhaseArgs,
    accounts: StartItemEscrowBuildPhaseAccounts,
    additionalArgs: StartItemEscrowBuildPhaseAdditionalArgs
  ) {
    const remainingAccounts =
      await generateRemainingAccountsGivenPermissivenessToUse({
        permissivenessToUse: args.buildPermissivenessToUse,
        tokenMint: accounts.itemClassMint,
        parentMint: accounts.parentMint,
        parentIndex: additionalArgs.parentClassIndex,
        parent: accounts.parentMint
          ? (
              await getItemPDA(
                accounts.parentMint,
                additionalArgs.parentClassIndex
              )
            )[0]
          : null,
        metadataUpdateAuthority: accounts.metadataUpdateAuthority,
        program: this.program,
      });

    const itemClassKey = (
      await getItemPDA(accounts.itemClassMint, args.classIndex)
    )[0];

    const itemEscrow = (
      await getItemEscrow({
        itemClassMint: accounts.itemClassMint,
        classIndex: args.classIndex,
        craftEscrowIndex: args.craftEscrowIndex,
        newItemMint: args.newItemMint,
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              args.newItemMint,
              args.originator || this.program.provider.wallet.publicKey
            )
          )[0],
        payer: args.originator || this.program.provider.wallet.publicKey,
        amountToMake: args.amountToMake,
        componentScope: args.componentScope,
      })
    )[0];

    await this.program.rpc.startItemEscrowBuildPhase(args, {
      accounts: {
        itemClass: itemClassKey,
        itemEscrow,
        newItemToken:
          accounts.newItemToken ||
          (
            await getAtaForMint(
              args.newItemMint,
              args.originator || this.program.provider.wallet.publicKey
            )
          )[0],
        newItemTokenHolder:
          accounts.newItemTokenHolder ||
          args.originator ||
          this.program.provider.wallet.publicKey,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
      },
      remainingAccounts:
        remainingAccounts.length > 0 ? remainingAccounts : undefined,
    });
  }

  async createItemClass(
    args: CreateItemClassArgs,
    accounts: CreateItemClassAccounts,
    additionalArgs: CreateItemClassAdditionalArgs
  ): Promise<web3.PublicKey> {
    const remainingAccounts = await generateRemainingAccountsForCreateClass({
      permissivenessToUse: args.updatePermissivenessToUse,
      tokenMint: accounts.itemMint,
      parentMint: accounts.parentMint,
      parent: accounts.parent,
      parentOfParentClassMint: accounts.parentOfParentClassMint,
      parentOfParentClassIndex: additionalArgs.parentOfParentClassIndex,
      parentOfParentClass:
        additionalArgs.parentOfParentClassIndex &&
        accounts.parentOfParentClassMint
          ? (
              await getItemPDA(
                accounts.parentOfParentClassMint,
                additionalArgs.parentOfParentClassIndex
              )
            )[0]
          : null,
      metadataUpdateAuthority: accounts.metadataUpdateAuthority,
      parentUpdateAuthority: accounts.parentUpdateAuthority,
      program: this.program,
    });

    convertNumsToBNs(args);

    const [itemClassKey, itemClassBump] = await getItemPDA(
      accounts.itemMint,
      args.classIndex
    );

    args.itemClassBump = itemClassBump;

    await this.program.rpc.createItemClass(args, {
      accounts: {
        itemClass: itemClassKey,
        itemMint: accounts.itemMint,
        metadata: await getMetadata(accounts.itemMint),
        edition: await getEdition(accounts.itemMint),
        parent: accounts.parent || itemClassKey,
        payer: this.program.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
      remainingAccounts:
        remainingAccounts.length > 0 ? remainingAccounts : undefined,
    });

    return itemClassKey;
  }

  async updateItem(
    args: UpdateItemArgs,
    _accounts: UpdateItemAccounts,
    _additionalArgs: UpdateItemAdditionalArgs
  ): Promise<web3.PublicKey> {
    const itemClassKey = (
      await getItemPDA(args.itemClassMint, args.classIndex)
    )[0];

    const itemKey = (await getItemPDA(args.itemMint, args.index))[0];

    await this.program.rpc.updateItem(args, {
      accounts: {
        itemClass: itemClassKey,
        item: itemKey,
      },
    });

    return itemClassKey;
  }

  async updateItemClass(
    args: UpdateItemClassArgs,
    accounts: UpdateItemClassAccounts,
    additionalArgs: UpdateItemClassAdditionalArgs
  ): Promise<web3.PublicKey> {
    const remainingAccounts =
      await generateRemainingAccountsGivenPermissivenessToUse({
        permissivenessToUse: args.updatePermissivenessToUse,
        tokenMint: accounts.itemMint,
        parentMint: accounts.parentMint,
        parentIndex: additionalArgs.parentClassIndex,
        parent: accounts.parent,
        metadataUpdateAuthority: accounts.metadataUpdateAuthority,
        program: this.program,
      });

    convertNumsToBNs(args);

    const itemClassKey = (
      await getItemPDA(accounts.itemMint, args.classIndex)
    )[0];

    await this.program.rpc.updateItemClass(args, {
      accounts: {
        itemClass: itemClassKey,
        itemMint: accounts.itemMint,
      },
      remainingAccounts:
        remainingAccounts.length > 0 ? remainingAccounts : undefined,
    });

    return itemClassKey;
  }
}

export async function getItemProgram(
  anchorWallet: NodeWallet | web3.Keypair,
  env: string,
  customRpcUrl: string
): Promise<ItemProgram> {
  if (customRpcUrl) log.debug("USING CUSTOM URL", customRpcUrl);

  const solConnection = new web3.Connection(customRpcUrl || getCluster(env));

  if (anchorWallet instanceof web3.Keypair)
    anchorWallet = new NodeWallet(anchorWallet);

  const provider = new Provider(solConnection, anchorWallet, {
    preflightCommitment: "recent",
  });

  const idl = await Program.fetchIdl(ITEM_ID, provider);

  const program = new Program(idl, ITEM_ID, provider);

  return new ItemProgram({
    id: ITEM_ID,
    program,
  });
}
