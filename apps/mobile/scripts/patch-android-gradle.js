const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

// jcenter() was removed in Gradle 9. This dependency is hosted on Maven Central.
const cookies = path.join(root, 'node_modules/@react-native-cookies/cookies/android/build.gradle');
if (fs.existsSync(cookies)) {
  const source = fs.readFileSync(cookies, 'utf8');
  const patched = source.replace(/\bjcenter\(\)/g, 'mavenCentral()');
  if (patched !== source) fs.writeFileSync(cookies, patched);
}

const wrapper = path.join(root, 'android/gradle/wrapper/gradle-wrapper.properties');
if (fs.existsSync(wrapper)) {
  const source = fs.readFileSync(wrapper, 'utf8');
  let patched = source.replace('gradle-8.14.3-bin.zip', 'gradle-9.1.0-bin.zip');
  if (patched.includes('gradle-9.1.0-bin.zip')) {
    const checksum = 'distributionSha256Sum=a17ddd85a26b6a7f5ddb71ff8b05fc5104c0202c6e64782429790c933686c806';
    patched = /^distributionSha256Sum=.*$/m.test(patched)
      ? patched.replace(/^distributionSha256Sum=.*$/m, checksum)
      : `${patched.trimEnd()}\n${checksum}\n`;
  }
  if (patched !== source) fs.writeFileSync(wrapper, patched);
}
console.log('Android Gradle compatibility patches checked.');
