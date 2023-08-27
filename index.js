#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import { execSync } from 'child_process';
import axios from 'axios';

let accessToken = null;
let username = null;

async function showHomeScreen() {
  console.clear();
  console.log(chalk.bold.green(figlet.textSync('GitCommander', { horizontalLayout: 'full' })));
  console.log(chalk.bgCyan(' Welcome to GitCommander - GitHub Repository Management CLI \n'));
  console.log(chalk.bold('This CLI application helps you manage GitHub repositories with ease.\n'));
  console.log(chalk.yellow('Before you begin, generate a GitHub access token:'));
  console.log(chalk.yellow('1. Log in to GitHub.'));
  console.log(chalk.yellow('2. Go to "Settings" > "Developer settings" > "Personal access tokens (classic)".'));
  console.log(chalk.yellow('3. Generate a new token with required permissions.'));
  console.log(chalk.yellow('4. Copy the token and paste it here when prompted.\n'));

  if (!accessToken) {
    accessToken = await getGitHubAccessToken();
  }

  if (!username) {
    username = await getUsername();
  }

}

async function getGitHubAccessToken() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'accessToken',
      message: 'Enter your GitHub access token:',
    },
  ]);
  return answers.accessToken;
}

async function getUsername() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: 'Enter your GitHub username:',
    },
  ]);
  return answers.username;
}

async function confirmAction(message) {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: message,
      default: false,
    },
  ]);
  return answers.confirm;
}

async function deleteAllRepositories(username, accessToken) {
  console.log(chalk.bgRed.bold('\nDelete All Repositories'));

  const confirm = await confirmAction('Are you sure you want to delete all your repositories? This action cannot be undone.');

  if (!confirm) {
    console.log('Action aborted.');
    return;
  }

  const url = `https://api.github.com/user/repos`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const repositories = response.data;

    for (const repo of repositories) {
      const repoName = repo.name;
      const deleteUrl = `https://api.github.com/repos/${username}/${repoName}`;

      try {
        await axios.delete(deleteUrl, { headers });
        console.log(`Repository ${repoName} deleted successfully!`);
      } catch (error) {
        console.error(`Error deleting repository ${repoName}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`Error fetching repositories: ${error.message}`);
  }
}

async function cloneAllRepositories(username, accessToken) {
  console.log(chalk.bold('\nClone All Repositories'));

  const { destinationPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'destinationPath',
      message: 'Enter the folder location where you want to clone the repositories:',
      default: './repositories', // Change this to your desired default path
    },
  ]);

  const url = `https://api.github.com/user/repos`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const repositories = response.data;

    for (const repo of repositories) {
      const repoName = repo.name;
      const cloneUrl = repo.clone_url;

      try {
        const clonePath = `${destinationPath}/${repoName}`;
        execSync(`git clone ${cloneUrl} ${clonePath}`);
        console.log(`Repository ${repoName} cloned successfully to ${clonePath}`);
      } catch (error) {
        console.error(`Error cloning repository ${repoName}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`Error fetching repositories: ${error.message}`);
  }
}


async function createNewRepository(accessToken, repositoryName) {
  const url = 'https://api.github.com/user/repos';
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
  };
  const requestData = {
    name: repositoryName,
    private: false, // Adjust this as needed
  };

  try {
    const response = await axios.post(url, requestData, { headers });
    return response.data.html_url;
  } catch (error) {
    console.error(`Error creating repository ${repositoryName}: ${error.message}`);
    return null;
  }
}

async function migrateRepository(username, accessToken) {
  console.log(chalk.bold('\nMigrate Repository'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'sourceRepoUrl',
      message: 'Enter the URL of the source repository:',
    },
    {
      type: 'input',
      name: 'newRepoName',
      message: 'Enter the name for the new repository:',
    },
    {
      type: 'input',
      name: 'newAuthorName',
      message: 'Enter the new author name:',
    },
    {
      type: 'input',
      name: 'newAuthorEmail',
      message: 'Enter the new author email:',
    },
  ]);

  const newRepoName = answers.newRepoName;
  const newAuthorName = answers.newAuthorName;
  const newAuthorEmail = answers.newAuthorEmail;
  const sourceRepoUrl = answers.sourceRepoUrl;

  const newRepoUrl = await createNewRepository(accessToken, newRepoName);
  if (!newRepoUrl) {
    console.error('Repository creation failed.');
    return;
  }

  const clonePath = `${newRepoName}.git`;

  try {
    console.log(`\nCloning source repository...`);
    execSync(`git clone --bare ${sourceRepoUrl} ${clonePath}`);
  } catch (error) {
    console.error(`Error cloning source repository: ${error.message}`);
    return;
  }

  process.chdir(clonePath);

  try {
    console.log(`\nUpdating author information...`);
    execSync(`
      git filter-branch --env-filter '
        export GIT_AUTHOR_NAME="${newAuthorName}"
        export GIT_AUTHOR_EMAIL="${newAuthorEmail}"
        export GIT_COMMITTER_NAME="${newAuthorName}"
        export GIT_COMMITTER_EMAIL="${newAuthorEmail}"
      ' --tag-name-filter cat -- --branches --tags
    `);
  } catch (error) {
    console.error(`Error updating author information: ${error.message}`);
    return;
  }

  process.chdir('..');

  try {
    console.log(`\nCloning updated repository...`);
    execSync(`git clone ${clonePath} ${newRepoName}`);
  } catch (error) {
    console.error(`Error cloning updated repository: ${error.message}`);
    return;
  }

  process.chdir(newRepoName);

  try {
    console.log(`\nSetting remote origin URL...`);
    execSync(`git remote set-url origin ${newRepoUrl}`);
  } catch (error) {
    console.error(`Error setting remote origin URL: ${error.message}`);
    return;
  }

  try {
    console.log(`\nPushing to the new repository...`);
    execSync('git push --mirror origin');
  } catch (error) {
    console.error(`Error pushing to new repository: ${error.message}`);
    return;
  }

  process.chdir('..');

  try {
    console.log(`\nCleaning up...`);
    execSync(`rm -rf ${clonePath}`);
  } catch (error) {
    console.error(`Error cleaning up: ${error.message}`);
    return;
  }

  console.log(chalk.green('\nRepository migration completed successfully.'));
}


async function main() {
  let continueRunning = true;

  while (continueRunning) {
    try {
      await showHomeScreen();

      console.log("\n");
      const { selectedFeature } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedFeature',
          message: 'Select an option:',
          choices: [
            { name: 'Clone All Repositories', value: 'clone' },
            { name: 'Delete All Repositories', value: 'delete' },
            { name: 'Migrate Repository', value: 'migrate' },
            { name: 'Exit', value: 'exit' },
          ],
        },
      ]);

      if (selectedFeature === 'exit') {
        console.log('Exiting GitCommander. Goodbye!');
        continueRunning = false;
        continue;
      }

      console.clear();
      console.log(chalk.bgCyan(figlet.textSync('GitCommander', { horizontalLayout: 'full' })));
      console.log(chalk.bgBlue(`Selected Feature: ${selectedFeature}`));

      if (selectedFeature === 'clone') {
        await cloneAllRepositories(username, accessToken);
      } else if (selectedFeature === 'delete') {
        await deleteAllRepositories(username, accessToken);
      } else if (selectedFeature === 'migrate') {
        await migrateRepository(username, accessToken);
      }

      const { backToHome } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'backToHome',
          message: 'Do you want to go back to the home screen?',
          default: true,
        },
      ]);

      if (!backToHome) {
        continueRunning = false;
      }

    } catch (error) {
      console.error(chalk.red('\nAn error occurred:'), error);
    }
  }
}

main();