'use strict';

class InstallController {
  constructor($scope, $timeout, installerDataSvc) {
    this.$scope = $scope;
    this.$timeout = $timeout;
    this.installerDataSvc = installerDataSvc;

    this.data = Object.create(null);

    this.installerDataSvc.allInstallables().forEach((value, key, map) => {
      let itemProgress = new ProgressState(this.$scope);
      Object.defineProperty(this.data, key, {
        enumerable: true,
        writable: true,
        value: itemProgress
      });

      if (value.isDownloadRequired() && !value.isDownloaded()) {
        this.installerDataSvc.startDownload(key);

        $timeout(
          value.downloadInstaller(itemProgress,
            () => {
              $timeout(this.installerDataSvc.downloadDone(itemProgress, key));
            },
            (error) => {
              alert(error);
            }
          )
        );
      } else if (!value.hasExistingInstall()) {
        this.installerDataSvc.startInstall(key);
        $timeout(
          value.install(itemProgress,
            () => {
              this.installerDataSvc.installDone(key);
            },
            (error) => {
              alert(error);
            }
          )
        );
      }
    });
  }

  current(key) {
    return this.data[key].current;
  }

  label(key) {
    return this.data[key].label;
  }

  desc(key) {
    return this.data[key].desc;
  }
}

class ProgressState {
  constructor($scope) {
    this.$scope = $scope;
    this.current = 0;
    this.label = '';
    this.desc = '';
  }

  setCurrent(newVal) {
    if (newVal == this.current) return;

    this.$scope.$apply(() => {
      this.current = newVal;
    });
  }

  setLabel(newLabel) {
    if (newLabel == this.label) return;

    this.label = newLabel;
  }

  setDesc(newDesc) {
    if (newDesc == this.desc) return;

    this.desc = newDesc;
  }

  setComplete(newLabel) {
    this.$scope.$apply(() => {
      this.current = 100;
      this.label = newLabel;
    });
  }
}

InstallController.$inject = ['$scope', '$timeout', 'installerDataSvc'];

export default InstallController;