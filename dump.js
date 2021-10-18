const util = require('util');
var moment = require('moment');  
const exec = util.promisify(require('child_process').exec);
var now = moment();
var sleep = require('system-sleep');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))


const threadCount = 10;
const knownOwners = [
  'username@company.com',
  'username2@company.com'
]

/*
 node dump.js | tee -a dump.txt
*/

const errors = [];
const retry = [];

async function workerThread(apps, threadId, logError) {

  for (const index in apps) {
    const element = apps[index];

    try {
      const appId = element.appId;
      const displayName = element.displayName;

      if (element.passwordCredentials.length > 0) {
        const secrets = element.passwordCredentials.map(item => moment(item.endDate).format('yyyy-MM-DD'));
        
        await delay(1);
        const { stdout, stderr, error } = await exec(`az ad app owner list --id ${element.appId}`);

        if (error || stderr) {
          if (logError) {
            errors.push(`${element?.appId} - ${element?.displayName}`)
          } else {
            retry.push(element);
          }
        } else {
          const ownersJson = JSON.parse(stdout);

          const userPrincipalNames = ownersJson.map(item => item.userPrincipalName?.toLowerCase());
          const displayNames = ownersJson.map(item => item.displayName?.toLowerCase());
          if (userPrincipalNames.some(item => knownOwners.includes(item))) {
            console.log(`t-${threadId}[${index}]|${displayName}|${userPrincipalNames.join(',')}|${displayNames.join(',')}|${secrets.join(',')}`);
          }
        }
      }

    } catch (error) {
      if (logError) {
        errors.push(`${element?.appId} - ${element?.displayName}`)
      } else {
        retry.push(element);
      }
    }

  }
}



async function dump() {
  await exec(`az ad app list --all > dump.json`);

  const fs = require('fs')
  let allApps = JSON.parse(fs.readFileSync('dump.json', 'utf-8'))

  const length = allApps.length;
  const partLength = parseInt(length / threadCount, 10);
  
  await exec(`:> dump.txt`);
  console.log(`Apps in ad: ${length}, threads: ${threadCount}, partSize: ${partLength}`);
  console.log('Info|App|samAccountNames|displayNames|secret exp dates')


  const threads = [];
  for (let i = 0; i < threadCount - 1; i++) {
    const part = allApps.splice(0, partLength);
    const thread = workerThread(part, i, false);
    threads.push(thread);
  }
  
  await Promise.all(threads);
  await workerThread(retry, 'retry', true);

  console.log(`--- Errors --- Count: ${errors.length}`)
  errors.forEach(item => {
    console.log(item);
  });
  
}

dump();

return;