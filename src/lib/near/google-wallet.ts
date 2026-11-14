type Activation = {
  checkAccessKey: () => Promise<unknown>;
  sponsor: () => Promise<void>;
};

// An implicit address exists in Privy before it exists on NEAR. Never sign until
// its first funding transfer has created the account and its full-access key.
export function createGoogleWalletActivation({
  checkAccessKey,
  sponsor,
}: Activation) {
  let pending: Promise<void> | undefined;
  async function active() {
    try {
      await checkAccessKey();
      return true;
    } catch (error) {
      const type =
        error && typeof error === "object" && "type" in error
          ? error.type
          : undefined;
      if (type === "AccessKeyDoesNotExist" || type === "AccountDoesNotExist")
        return false;
      throw error;
    }
  }
  async function activate() {
    if (await active()) return;
    await sponsor();
    if (!(await active()))
      throw new Error(
        "Google wallet activation has not completed. Retry in a moment or fund your wallet with test NEAR.",
      );
  }
  return () => {
    pending ??= activate().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
