# Checklist before publishing

```sh
set -e

export PROJECT_NAME=$(node -e 'console.log(require("./package.json").name)')
export TMP_WORKSPACE=/tmp/"$PROJECT_NAME"-test-workspace

# Repack, and check the contents
export TARBALL="$(npm pack)"
tar tfz "$TARBALL"

# Test that it installs and tests run in isolation
rm -rf "$TMP_WORKSPACE"
mkdir -p "$TMP_WORKSPACE"/package
cp "$TARBALL" "$TMP_WORKSPACE"/
cp -r test/ "$TMP_WORKSPACE"/package/test/
pushd "$TMP_WORKSPACE"
  tar xfz "$TARBALL" && (
    pushd "$TMP_WORKSPACE"/package
      npm install \
      && npm test
    popd
  )
popd
```

Figure out what kind of release it is:

*  patch
*  minor
*  major

```sh
npm version patch
```

Get a 2FA nonce.

```sh
npm publish --otp 
```