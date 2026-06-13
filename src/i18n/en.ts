/** English strings (the pilot's primary language). zh-HK / pt to follow. */
export const en = {
  common: {
    continue: 'Continue',
    cancel: 'Cancel',
    done: 'Done',
    next: 'Next',
    back: 'Back',
    save: 'Save',
    chips: 'Chips',
    noCashValue: 'Chips are for entertainment only and have no real-world cash value.',
    eighteenPlus: 'You must be 18 or older to play.',
  },
  auth: {
    welcomeTitle: 'Bet on anything.\nWith your friends.',
    welcomeSub: 'Make a wager, pool your Chips, settle the score. No cash — all bragging rights.',
    continueEmail: 'Continue with email',
    continueGoogle: 'Continue with Google',
    continueApple: 'Continue with Apple',
    continuePhone: 'Continue with phone',
  },
  bet: {
    create: 'Create a bet',
    join: 'Join this bet',
    pot: 'In the pot',
    locksIn: 'Locks in',
    resolve: 'Resolve',
    dispute: 'Dispute',
    youWon: 'You won!',
    youLost: 'Tough luck',
  },
  wallet: {
    balance: 'Your balance',
    inPlay: 'In play',
    dailyChips: 'Claim daily Chips',
    refill: 'Get a free refill',
  },
} as const;

export type Strings = typeof en;
