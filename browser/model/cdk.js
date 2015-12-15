'use strict';

let fs = require('fs-extra');
let request = require('request');
let path = require('path');
let unzip = require('unzip');
let ipcRenderer = require('electron').ipcRenderer;

import InstallableItem from './installable-item';
import Downloader from './handler/downloader';

class CDKInstall extends InstallableItem {
  constructor(installerDataSvc, $timeout, cdkUrl, cdkBoxUrl, ocUrl, vagrantFileUrl, pscpUrl, installFile) {
    super(cdkUrl, installFile);

    this.installerDataSvc = installerDataSvc;
    this.$timeout = $timeout;
    this.cdkBoxUrl = cdkBoxUrl;
    this.ocUrl = ocUrl;
    this.vagrantFileUrl = vagrantFileUrl;
    this.pscpUrl = pscpUrl;

    this.boxName = 'rhel-cdk-kubernetes-7.2-6.x86_64.vagrant-virtualbox.box';

    this.cdkDownloadedFile = path.join(this.installerDataSvc.tempDir(), 'cdk.zip');
    this.cdkBoxDownloadedFile = path.join(this.installerDataSvc.tempDir(), this.boxName);
    this.ocDownloadedFile = path.join(this.installerDataSvc.tempDir(), 'oc.zip');
    this.vagrantDownloadedFile = path.join(this.installerDataSvc.tempDir(), 'vagrantfile.zip');
    this.pscpDownloadedFile = path.join(this.installerDataSvc.tempDir(), 'pscp.exe');
    this.pscpPathScript = path.join(this.installerDataSvc.tempDir(), 'set-pscp-path.ps1');
  }

  checkForExistingInstall() {
  }

  downloadInstaller(progress, success, failure) {
    progress.setDesc('Downloading CDK');

    let cdkBoxWriteStream = fs.createWriteStream(this.cdkBoxDownloadedFile);
    let cdkWriteStream = fs.createWriteStream(this.cdkDownloadedFile);
    let ocWriteStream = fs.createWriteStream(this.ocDownloadedFile);
    let vagrantFileWriteStream = fs.createWriteStream(this.vagrantDownloadedFile);
    let pscpWriteStream = fs.createWriteStream(this.pscpDownloadedFile);
    let downloadSize = 869598013;
    let totalDownloads = 5;

    let downloader = new Downloader(progress, success, failure, downloadSize, totalDownloads);
    let username = this.installerDataSvc.getUsername(),
        password = this.installerDataSvc.getPassword();

    downloader.setWriteStream(cdkBoxWriteStream);
    downloader.downloadAuth
      ({
        url: this.cdkBoxUrl,
        rejectUnauthorized: false
      }, username, password);

    downloader.setWriteStream(cdkWriteStream);
    downloader.downloadAuth
      ({
        url: this.getDownloadUrl(),
        rejectUnauthorized: false
      }, username, password);

    downloader.setWriteStream(ocWriteStream);
    downloader.download(this.ocUrl);

    downloader.setWriteStream(vagrantFileWriteStream);
    downloader.download(this.vagrantFileUrl)

    downloader.setWriteStream(pscpWriteStream);
    downloader.download(this.pscpUrl)
  }

  install(progress, success, failure) {
    progress.setDesc('Installing CDK');

    fs.createReadStream(this.cdkDownloadedFile)
      .pipe(unzip.Extract({path: this.installerDataSvc.installDir()}))
      .on('close', () => {
        fs.move(this.cdkBoxDownloadedFile, path.join(this.installerDataSvc.cdkBoxDir(), this.boxName), (err) => {
          fs.createReadStream(this.ocDownloadedFile)
            .pipe(unzip.Extract({path: this.installerDataSvc.ocDir()}))
            .on('close', () => {
              fs.createReadStream(this.vagrantDownloadedFile)
                .pipe(unzip.Extract({path: this.installerDataSvc.tempDir()}))
                .on('close', () => {
                  fs.move(
                    path.join(this.installerDataSvc.tempDir(), 'openshift-vagrant-master', 'cdk-v2'),
                    this.installerDataSvc.cdkVagrantfileDir(),
                    (err) => {
                      fs.move(
                        this.pscpDownloadedFile,
                        path.join(this.installerDataSvc.ocDir(), 'pscp.exe'),
                        (err) => {
                          // Set required paths
                          let data = [
                            '$newPath = "' + this.installerDataSvc.ocDir() + '";',
                            '$oldPath = [Environment]::GetEnvironmentVariable("path", "User");',
                            '[Environment]::SetEnvironmentVariable("Path", "$newPath;$oldPath", "User");',
                            '[Environment]::Exit(0)'
                          ].join('\r\n');
                          fs.writeFileSync(this.pscpPathScript, data);

                          require('child_process')
                            .execFile(
                              'powershell',
                              [
                                '-ExecutionPolicy',
                                'ByPass',
                                '-File',
                                this.pscpPathScript
                              ],
                              (error, stdout, stderr) => {
                                console.log(stdout);
                                console.log(stderr);
                                if (error !== null) {
                                  failure(error);
                                }

                                let markerContent = [
                                  'openshift.auth.scheme=Basic',
                                  'openshift.auth.username=test-admin',
                                  'vagrant.binary.path=' + path.join(this.installerDataSvc.vagrantDir(), 'bin'),
                                  'oc.binary.path=' + this.installerDataSvc.ocDir(),
                                  'rhel.subscription.username=' + this.installerDataSvc.getUsername()
                                ].join('\r\n');
                                fs.writeFileSync(this.installerDataSvc.cdkMarker(), markerContent);

                                let vagrantInstall = this.installerDataSvc.getInstallable('vagrant');

                                if (vagrantInstall !== undefined && vagrantInstall.isInstalled()) {
                                  this.postVagrantSetup(progress, success, failure);
                                } else {
                                  ipcRenderer.on('installComplete', (event, arg) => {
                                    if (arg == 'vagrant') {
                                      this.postVagrantSetup(progress, success, failure);
                                    }
                                  });
                                }
                              }
                            );
                        }
                      );
                  });
                });
            });
        });
      });
  }

  createEnvironment() {
    let env = {};

    //TODO Need to get this info from VagrantInstaller rather than hard code
    env['path'] = path.join(this.installerDataSvc.vagrantDir(), 'bin') + ';';

    return env;
  }

  postVagrantSetup(progress, success, failure) {
    let vagrantInstall = this.installerDataSvc.getInstallable('vagrant');

    if (vagrantInstall !== undefined && vagrantInstall.isInstalled()) {
      // Vagrant is installed, add CDK bits
      let env = this.createEnvironment();
      require('child_process')
        .exec(
          'vagrant plugin install ' +
          path.join(this.installerDataSvc.cdkDir(), 'plugins', 'vagrant-registration-1.0.0.gem'),
          {
            cwd: path.join(this.installerDataSvc.vagrantDir(), 'bin'),
            env: env
          },
          (error, stdout, stderr) => {
            console.log(stdout);
            console.log(stderr);
            if (error !== null) {
              return failure(error);
            }

            require('child_process')
              .exec(
                'vagrant plugin install ' +
                path.join(this.installerDataSvc.cdkDir(), 'plugins', 'vagrant-adbinfo-0.0.5.gem'),
                {
                  cwd: path.join(this.installerDataSvc.vagrantDir(), 'bin'),
                  env: env
                },
                (error, stdout, stderr) => {
                  console.log(stdout);
                  console.log(stderr);
                  if (error !== null) {
                    return failure(error);
                  }

                  require('child_process')
                    .exec(
                      'vagrant box add --name cdk_v2 ' +
                      path.join(this.installerDataSvc.cdkBoxDir(), this.boxName),
                      {
                        cwd: path.join(this.installerDataSvc.vagrantDir(), 'bin'),
                        env: env
                      },
                      (error, stdout, stderr) => {
                        console.log(stdout);
                        console.log(stderr);
                        if (error !== null) {
                          return failure(error);
                        }

                        progress.setComplete("Complete");
                        success();
                      }
                    );
                }
              );
          }
        );
    }
  }
}

export default CDKInstall;
