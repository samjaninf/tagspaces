/* Copyright (c) 2012-2016 The TagSpaces Authors. All rights reserved.
 * Use of this source code is governed by a AGPL3 license that
 * can be found in the LICENSE file. */

/* global define, Handlebars, isNode, isFirefox, Mousetrap */
define(function(require, exports) {
  'use strict';

  console.log('Loading core.ui.js ...');

  var TSCORE = require('tscore');
  var TSPOSTIO = require("tspostioapi");

  require('datetimepicker');
  require('moment');

  var tsGettingStarted;
  var fileContent;
  var fileType;
  var waitingDialogTimeoutID;
  var addFileInputName;

  var fileDropTemplate = Handlebars.compile(
    '<div id="fileDropArea">' +
    '<div id="fileDropExplanation"><i class="fa fa-2x fa-mail-forward"></i><br>' +
    '<span>Drop files here in order to be copied or moved in the current folder</span></div>' +
    '</div>'
  );

  function initUI() {
    $('#appVersion').text(TSCORE.Config.DefaultSettings.appVersion + '.' + TSCORE.Config.DefaultSettings.appBuild);
    $('#appVersion').attr('title', 'BuildID: ' + TSCORE.Config.DefaultSettings.appVersion + '.' + TSCORE.Config.DefaultSettings.appBuild + '.' + TSCORE.Config.DefaultSettings.appBuildID);

    // prevent default behavior from changing page on dropped file
    $(document).on('drop dragend dragenter dragover', function(event) { // dragleave
      //  dragstart drag
      event.preventDefault();
    });

    // Managing droping of files in the perspectives
    if (isNode || isElectron) {
      $('#viewContainers').on('dragenter', function(event) {
        event.preventDefault();
        showFileDropArea();
      });
      $('#viewContainers').on('drop', function(event) {
        //event.preventDefault();
        if (event.originalEvent.dataTransfer !== undefined) {
          var files = event.originalEvent.dataTransfer.files;
          TSCORE.IO.focusWindow();
          hideFileDropArea();
          TSCORE.PerspectiveManager.clearSelectedFiles();
          var filePath;
          if (files !== undefined && files.length > 0) {
            for (var i = 0; i < files.length; i++) {
              // file[i] -> {"webkitRelativePath":"","path":"/home/na/Desktop/Kola2","lastModifiedDate":"2014-07-11T16:40:52.000Z","name":"Kola2","type":"","size":4096}
              filePath = files[i].path;
              if (filePath.length > 1) {
                TSCORE.selectedFiles.push(filePath);
              }
            }
          }
          if (TSCORE.selectedFiles.length > 0) {
            showMoveCopyFilesDialog();
          }
        }
      });

      //Mousetrap.unbind(TSCORE.Config.getPrevDocumentKeyBinding());
      Mousetrap.bind(TSCORE.Config.getPrevDocumentKeyBinding(), function() {
        if (TSCORE.selectedFiles[0]) {
          TSCORE.PerspectiveManager.selectFile(TSCORE.PerspectiveManager.getPrevFile(TSCORE.selectedFiles[0]));
        }
        if (TSCORE.FileOpener.getOpenedFilePath() !== undefined) {
          TSCORE.FileOpener.openFile(TSCORE.PerspectiveManager.getPrevFile(TSCORE.FileOpener.getOpenedFilePath()));
        }
        return false;
      });
      //Mousetrap.unbind(TSCORE.Config.getNextDocumentKeyBinding());
      Mousetrap.bind(TSCORE.Config.getNextDocumentKeyBinding(), function() {
        if (TSCORE.selectedFiles[0]) {
          TSCORE.PerspectiveManager.selectFile(TSCORE.PerspectiveManager.getNextFile(TSCORE.selectedFiles[0]));
        }
        if (TSCORE.FileOpener.getOpenedFilePath() !== undefined) {
          TSCORE.FileOpener.openFile(TSCORE.PerspectiveManager.getNextFile(TSCORE.FileOpener.getOpenedFilePath()));
        }
        return false;
      });
    }

    $('#addFileInput').on('change', function(selection) {
      //console.log("Selected File: "+$("#addFileInput").val());
      var file = selection.currentTarget.files[0];
      //console.log("Selected File: "+JSON.stringify(selection.currentTarget.files[0]));
      addFileInputName = decodeURIComponent(file.name);
      var reader = new FileReader();
      reader.onload = onFileReadComplete;
      if (isCordova) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });

    $('#openLeftPanel').click(function() {
      TSCORE.openLeftPanel();
    });

    $('#closeLeftPanel').click(function() {
      TSCORE.closeLeftPanel();
    });

    $('#txtFileTypeButton').click(function(e) {
      // Fixes reloading of the application by click
      e.preventDefault();
      fileContent = TSCORE.Config.getNewTextFileContent();
      fileType = 'txt';
    });

    $('#htmlFileTypeButton').click(function(e) {
      // Fixes reloading of the application by click
      e.preventDefault();
      fileContent = TSCORE.Config.getNewHTMLFileContent();
      fileType = 'html';
    });

    $('#mdFileTypeButton').click(function(e) {
      // Fixes reloading of the application by click
      e.preventDefault();
      fileContent = TSCORE.Config.getNewMDFileContent();
      fileType = 'md';
    });

    $('#fileCreateConfirmButton').click(function() {
      var fileTags = '';
      var rawTags = $('#newFileNameTags').val().split(',');
      rawTags.forEach(function(value, index) {
        if (index === 0) {
          fileTags = value;
        } else {
          fileTags = fileTags + TSCORE.Config.getTagDelimiter() + value;
        }
      });
      if ($('#tagWithCurrentDate').prop('checked')) {
        if (fileTags.length < 1) {
          fileTags = TSCORE.TagUtils.formatDateTime4Tag(new Date());
        } else {
          fileTags = fileTags + TSCORE.Config.getTagDelimiter() + TSCORE.TagUtils.formatDateTime4Tag(new Date());
        }
      }
      if (fileTags.length > 0) {
        fileTags = TSCORE.TagUtils.beginTagContainer + fileTags + TSCORE.TagUtils.endTagContainer;
      }
      var filePath = TSCORE.currentPath + TSCORE.dirSeparator + $('#newFileName').val() + fileTags + '.' + fileType;
      TSCORE.IO.saveFilePromise(filePath, fileContent).then(function() {
        TSCORE.PerspectiveManager.refreshFileListContainer();
        TSCORE.FileOpener.openFile(filePath, true);
        TSCORE.showSuccessDialog("File created successfully."); // TODO translate
      }, function(error) {
        TSCORE.hideLoadingAnimation();
        TSCORE.showAlertDialog("Saving " + filePath + " failed.");
        console.error("Save to file " + filePath + " failed " + error);
      });
    });

    $('#renameFileButton').click(function() {
      var initialFilePath = $('#renamedFileName').attr('filepath');
      var containingDir = TSCORE.TagUtils.extractContainingDirectoryPath(initialFilePath);
      var newFilePath = containingDir + TSCORE.dirSeparator + $('#renamedFileName').val();
      TSCORE.IO.renameFilePromise(initialFilePath, newFilePath).then(function(success) {
        TSCORE.hideWaitingDialog();
        TSPOSTIO.renameFile(initialFilePath, newFilePath);
      }, function(err) {
        TSCORE.hideWaitingDialog();
        TSCORE.showAlertDialog(err);
      });
    });

    // Edit Tag Dialog
    $('#plainTagTypeButton').click(function(e) {
      // Fixes reloading of the application by click
      e.preventDefault();
      TSCORE.selectedTag, $('#newTagName').datepicker('destroy').val('');
    });

    $('#dateTagTypeButton').click(function(e) {
      // Fixes reloading of the application by click
      e.preventDefault();
      TSCORE.selectedTag, $('#newTagName').datepicker({
        showWeek: true,
        firstDay: 1,
        dateFormat: 'yymmdd'
      });
    });

    $('#currencyTagTypeButton').click(function(e) {
      // Fixes reloading of the application by click
      e.preventDefault();
      TSCORE.selectedTag, $('#newTagName').datepicker('destroy').val('XEUR');
    });

    // End Edit Tag Dialog
    $('#startNewInstanceBack').on('click', openNewInstance);

    function reloadAboutContent() {
      if (TSCORE.PRO) {
        $('#aboutIframe').attr('src', 'pro/about.html');
      } else {
        $('#aboutIframe').attr('src', 'about.html');
      }
    }

    $('#aboutDialogBack').on('click', reloadAboutContent);
    $('#dialogAboutTS').on('show.bs.modal', reloadAboutContent);

    // Open About Dialog
    $('#openAboutBox').on('click', function() {
      $('#dialogAbout').modal({
        backdrop: 'static',
        show: true
      });
      $('#dialogAbout').draggable({
        handle: ".modal-header"
      });
    });

    // Open Options Dialog
    $('#openOptions').on('click', function() {
      showOptionsDialog();
    });

    // File Menu
    $('#fileMenuAddTag').on('click', function() {
      TSCORE.showAddTagsDialog();
    });

    $('#fileMenuOpenFile').on('click', function() {
      TSCORE.FileOpener.openFile(TSCORE.selectedFiles[0]);
    });

    $('#fileMenuOpenNatively').on('click', function() {
      TSCORE.IO.openFile(TSCORE.selectedFiles[0]);
    });

    $('#fileMenuSendTo').on('click', function() {
      TSCORE.IO.sendFile(TSCORE.selectedFiles[0]);
    });

    $('#fileMenuOpenDirectory').on('click', function() {
      var dirPath = TSCORE.Utils.dirName(TSCORE.selectedFiles[0]);
      TSCORE.IO.openDirectory(dirPath);
    });

    $('#fileMenuRenameFile').on('click', function() {
      TSCORE.showFileRenameDialog(TSCORE.selectedFiles[0]);
    });

    $('#fileMenuMoveCopyFile').on('click', function() {
      TSCORE.showMoveCopyFilesDialog();
    });

    $('#fileMenuDeleteFile').on('click', function() {
      TSCORE.showFileDeleteDialog(TSCORE.selectedFiles[0]);
    });

    // End File Menu


    $('#createTextFileButton').on('click', createTXTFile);

    $('#createHTMLFileButton').on('click', createHTMLFile);

    $('#createMarkdownFileButton').on('click', createMDFile);

    $('#createAudioFileButton').on('click', showAudioRecordingDialog);

    $('#addExistingFileButton').on('click', function() {
      $("#addFileInput").click();
    });

    $('#showLocations').on('click', function() {
      showLocationsPanel();
    });

    $('#disagreeLicenseButton').on('click', function() {
      TSCORE.Config.Settings.firstRun = true;
      TSCORE.Config.saveSettings();
      window.close();
    });

    $('#showTagGroups').click(function() {
      showTagsPanel();
    });

    $('#contactUs').click(function() {
      showContactUsPanel();
    });

    // Hide the tagGroupsContent or locationContent by default
    $('#locationContent').hide();

    $('#perspectiveSwitcherButton').prop('disabled', true);

    $('#newVersionAvailable').on("click", function() {
      $('#openWhatsnew').click();
    });

    $('#dialogShortcuts').on('show.bs.modal', setKeyboardShortcutsHelp);

    var $contactUsContent = $('#contactUsContent');
    $contactUsContent.on('click', '#openHints', showWelcomeDialog);
    $contactUsContent.on('click', '#openUservoice', function(e) {
      e.preventDefault();
      TSCORE.IO.openFile($(this).attr('href'));
    });
    $contactUsContent.on('click', '#openGooglePlay', function(e) {
      e.preventDefault();
      TSCORE.IO.openFile($(this).attr('href'));
    });
    $contactUsContent.on('click', '#openAppleAppStore', function(e) {
      e.preventDefault();
      TSCORE.IO.openFile($(this).attr('href'));
    });
    $contactUsContent.on('click', '#openWhatsnew', function(e) {
      e.preventDefault();
      TSCORE.UI.whatsNew();
    });
    $contactUsContent.on('click', '#openGitHubIssues', function(e) {
      e.preventDefault();
      TSCORE.UI.reportIssues();
    });
    $contactUsContent.on('click', '#helpUsTranslate', function(e) {
      e.preventDefault();
      TSCORE.IO.openFile($(this).attr('href'));
    });
    $contactUsContent.on('click', '#openTwitter', function(e) {
      e.preventDefault();
      TSCORE.UI.openTwitter();
    });
    $contactUsContent.on('click', '#openTwitter2', function(e) {
      e.preventDefault();
      TSCORE.IO.openFile($(this).attr('href'));
    });
    $contactUsContent.on('click', '#openGooglePlus', function(e) {
      e.preventDefault();
      TSCORE.UI.openGooglePlus();
    });
    $contactUsContent.on('click', '#openFacebook', function(e) {
      e.preventDefault();
      TSCORE.UI.openFacebook();
    });
    $contactUsContent.on('click', '#openSupportUs', function(e) {
      e.preventDefault();
      TSCORE.IO.openFile($(this).attr('href'));
    });

    $('#newVersionMenu').on('click', '.whatsNewLink', function(e) {
      e.preventDefault();
      TSCORE.IO.openFile($(this).attr('href'));
    });

    initTagEditDialog();

    initFileRenameDialog();

    TSCORE.Calendar.initCalendarUI();

    // Hide drop downs by click and drag
    $(document).click(function() {
      TSCORE.hideAllDropDownMenus();
    });

    platformTuning();

    //initResizableUI();
  }

  /* function initResizableUI() {
      var dividerStorage = 80;
      $(".row-divider").draggable({
          axis: "y",
          containment: $(".col3"),
          drag: function(e, ui) {
            console.log("top offset: " + ui.offset.top + " - " + ui.position.top);
            //$(".col3 .row1").css("height", (ui.offset.top-15) + "px");

            $(".col3 .row1").css("flex", "0 1 " + (ui.offset.top) + "px");

            $(".col3 .row2").css("flex", "1");
          },
          stop: function(e, ui) {
              console.log("height: " + $(".col3 .row1").css('height'))
              ui.position.top = $(".col3 .row1").css('height');
          }
      });
  }*/

  function openNewInstance() {
    if (!isCordova) {
      window.open(window.location.href, '_blank', 'width=1260,height=748');
    }
  }

  function showFileDropArea() {
    if ($('#fileDropArea').length < 1) {
      $('#viewContainers').append(fileDropTemplate({}));
      $('#fileDropArea').on('dragleave', function(event) {
        event.preventDefault();
        hideFileDropArea();
      });
    } else {
      $('#fileDropArea').show();
    }
  }

  function hideFileDropArea() {
    $('#fileDropArea').hide();
  }

  function onFileReadComplete(event) {
    console.log('Content on file read complete: ' + JSON.stringify(event));
    //change name for ios fakepath
    if (isCordovaiOS) {
      var fileExt = TSCORE.TagUtils.extractFileExtension(addFileInputName);
      addFileInputName = TSCORE.TagUtils.beginTagContainer + TSCORE.TagUtils.formatDateTime4Tag(new Date(), true) + TSCORE.TagUtils.endTagContainer + fileExt;
    }
    var filePath = TSCORE.currentPath + TSCORE.dirSeparator + addFileInputName;

    // TODO event.currentTarget.result is ArrayBuffer
    // Sample call from PRO version using content = TSCORE.Utils.base64ToArrayBuffer(baseString);

    TSCORE.IO.saveBinaryFilePromise(filePath, event.currentTarget.result).then(function() {
      TSCORE.showSuccessDialog("File saved successfully.");
      TSCORE.PerspectiveManager.refreshFileListContainer();
    }, function(error) {
      TSCORE.hideLoadingAnimation();
      TSCORE.showAlertDialog("Saving " + filePath + " failed.");
      console.error("Save to file " + filePath + " failed " + error);
    });
    addFileInputName = undefined;
  }

  var openWaitingDialog;

  function showWaitingDialog(message, title) {
    openWaitingDialog = true;
    title = title || $.i18n.t('ns.dialogs:titleWaiting');
    message = message || 'No Message to Display.';
    var waitingModal = $('#waitingDialog');
    waitingModal.find('#waitingHeader').text(title);
    waitingModal.find('#waitingMessage').text(message);

    waitingDialogTimeoutID = window.setTimeout(function() {
      if (openWaitingDialog) {
        waitingModal.modal({
          backdrop: 'static',
          show: true
        });
        openWaitingDialog = false;
      }
    }, 500);

    waitingModal.draggable({
      handle: ".modal-header"
    });
  }

  function hideWaitingDialog(message, title) {
    openWaitingDialog = false;
    window.clearTimeout(waitingDialogTimeoutID);
    $('#waitingDialog').modal('hide');
  }

  function showSuccessDialog(message) {
    if (!message) {
      return;
    }
    var n = noty({
      text: message,
      //dismissQueue: false,
      layout: 'bottomCenter',
      theme: 'relax',
      type: 'success',
      animation: {
        open: 'animated fadeIn',
        close: 'animated fadeOut',
        easing: 'swing',
        speed: 500
      },
      timeout: 4000,
      maxVisible: 1,
      closeWith: ['button', 'click'],
    });
  }

  function showAlertDialog(message, title) {
    title = title || $.i18n.t('ns.dialogs:titleAlert');
    message = message || 'No Message to Display.';
    console.warn(message + ' - ' + title);
    var n = noty({
      text: "<strong>" + title + "</strong><br>" + message,
      layout: 'bottomCenter',
      theme: 'relax',
      type: 'warning',
      animation: {
        open: 'animated fadeIn',
        close: 'animated fadeOut',
        easing: 'swing',
        speed: 500
      },
      timeout: 6000,
      maxVisible: 4,
      closeWith: ['button', 'click'],
    });
  }

  function showConfirmDialog(title, message, okCallback, cancelCallback, confirmShowNextTime) {
    title = title || $.i18n.t('ns.dialogs:titleConfirm');
    message = message || 'No Message to Display.';
    var confirmModal = $('#confirmDialog');
    if (confirmShowNextTime) {
      confirmModal.find('#showThisDialogAgain').prop('checked', true);
    } else {
      confirmModal.find('#showThisDialogAgainContainer').hide();
    }
    confirmModal.find('h4').text(title);
    confirmModal.find('#dialogContent').text(message);
    confirmModal.find('#confirmButton').off('click').click(function() {
      okCallback(confirmModal.find('#showThisDialogAgain').prop('checked'));
      confirmModal.modal('hide');
    });
    // Focusing the confirm button by default
    confirmModal.off('shown.bs.modal');
    confirmModal.on('shown.bs.modal', function() {
      confirmModal.find('#confirmButton').focus();
    });
    confirmModal.find('#cancelButton').off('click').click(function() {
      if (cancelCallback !== undefined) {
        cancelCallback();
      }
      confirmModal.modal('hide');
    });
    confirmModal.modal({
      backdrop: 'static',
      show: true
    });
    confirmModal.draggable({
      handle: ".modal-header"
    });
  }

  function setKeyboardShortcutsHelp() {
    $('#nextDocumentKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getNextDocumentKeyBinding()));
    $('#prevDocumentKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getPrevDocumentKeyBinding()));
    $('#closeDocumentKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getCloseViewerKeyBinding()));
    $('#addRemoveTagsKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getAddRemoveTagsKeyBinding()));
    $('#editDocumentKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getEditDocumentKeyBinding()));
    $('#reloadDocumentKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getReloadDocumentKeyBinding()));
    $('#saveDocumentKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getSaveDocumentKeyBinding()));
    $('#documentPropertiesKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getPropertiesDocumentKeyBinding()));
    $('#showSearchKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getSearchKeyBinding()));
    $('#renamingFileKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getRenamingFileKeyBinding()));
    $('#selectAllKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getSelectAllKeyBinding()));
    $('#renamingFileKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getRenamingFileKeyBinding()));
    $('#openFileKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getOpenFileKeyBinding()));
    $('#openFileExternallyKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getOpenFileExternallyKeyBinding()));
    $('#deleteDocumentKeyBindingHelp').html(formatShortcuts(TSCORE.Config.getDeleteDocumentKeyBinding()));
  }

  function formatShortcuts(shortcut) {
    var modkey = "ctrl";
    if (isOSX) {
      modkey = '&#8984;'; //"command"; // &#8984;
    }
    shortcut = shortcut.toString().split('mod').join(modkey);
    shortcut = shortcut.toString().split('+').join(' + ');
    return shortcut;
  }

  function showFileCreateDialog() {
    fileContent = TSCORE.Config.getNewTextFileContent();
    // Default new file in text file
    fileType = 'txt';
    $('#newFileNameTags').select2('data', null);
    $('#newFileNameTags').select2({
      multiple: true,
      tags: TSCORE.Config.getAllTags(),
      tokenSeparators: [
        ',',
        ' '
      ],
      minimumInputLength: 1,
      selectOnBlur: true
    });
    $('#newFileName').val('');
    $('#tagWithCurrentDate').prop('checked', false);
    $('#txtFileTypeButton').button('toggle');
    $('#formFileCreate').validator();
    $('#formFileCreate').submit(function(e) {
      e.preventDefault();
    });
    $('#formFileCreate').on('invalid.bs.validator', function() {
      $('#fileCreateConfirmButton').prop('disabled', true);
    });
    $('#formFileCreate').on('valid.bs.validator', function() {
      $('#fileCreateConfirmButton').prop('disabled', false);
    });
    $('#dialogFileCreate').on('shown.bs.modal', function() {
      $('#newFileName').select2().focus();
    });
    $('#dialogFileCreate').modal({
      backdrop: 'static',
      show: true
    });
    $('#dialogFileCreate').draggable({
      handle: ".modal-header"
    });
  }

  function initFileRenameDialog() {
    $('#formFileRename').on('submit', function(e) {
      e.preventDefault();
      if ($('#renameFileButton').prop('disabled') === false) {
        $('#renameFileButton').click();
      }
    });
    $('#formFileRename').validator();
    $('#formFileRename').on('invalid.bs.validator', function() {
      $('#renameFileButton').prop('disabled', true);
    });
    $('#formFileRename').on('valid.bs.validator', function() {
      $('#renameFileButton').prop('disabled', false);
    });
    $('#dialogFileRename').on('shown.bs.modal', function() {
      $('#renamedFileName').focus();
    });
    $('#dialogFileRename').draggable({
      handle: ".modal-header"
    });
  }

  function showFileRenameDialog(filePath) {
    if (!filePath) {
      filePath = TSCORE.selectedFiles[0];
    }
    if (!filePath) {
      TSCORE.showAlertDialog("Please select a file first.", "Renaming not possible!");
      return false;
    }
    $('#renamedFileName').attr('filepath', filePath);
    $('#renamedFileName').val(TSCORE.TagUtils.extractFileName(filePath));
    $('#dialogFileRename').modal({
      backdrop: 'static',
      show: true
    });
  }

  function showFileDeleteDialog(filePath) {
    console.log('Deleting file...');
    var dlgConfirmMsgId = 'ns.dialogs:fileDeleteContentConfirm';
    if (TSCORE.PRO && TSCORE.Config.getUseTrashCan()) {
      dlgConfirmMsgId = 'ns.pro:trashDeleteContentConfirm';
    }
    TSCORE.showConfirmDialog($.i18n.t('ns.dialogs:fileDeleteTitleConfirm'), $.i18n.t(dlgConfirmMsgId, {
      filePath: filePath
    }), function() {
      TSCORE.IO.deleteFilePromise(filePath).then(function() {
          TSPOSTIO.deleteElement(filePath);
        },
        function(error) {
          TSCORE.hideLoadingAnimation();
          TSCORE.showAlertDialog("Deleting file " + filePath + " failed.");
          console.error("Deleting file " + filePath + " failed " + error);
        }
      );
    });
  }

  function showDeleteFilesDialog() {
    console.log('Deleting files...');
    var selFiles = " ";

    TSCORE.Utils.getUniqueSelectedFiles().forEach(function(file) {
      selFiles += " " + TSCORE.Utils.baseName(file) + " ,";
    });

    selFiles = selFiles.substring(0, selFiles.length - 1);
    var dlgConfirmMsgId = 'ns.dialogs:selectedFilesDeleteContentConfirm';

    if (TSCORE.PRO && TSCORE.Config.getUseTrashCan()) {
      dlgConfirmMsgId = 'ns.pro:trashFilesDeleteContentConfirm';
    }

    TSCORE.showConfirmDialog(
      $.i18n.t('ns.dialogs:fileDeleteTitleConfirm'),
      $.i18n.t(dlgConfirmMsgId, {selectedFiles: selFiles}),
      function() {
        if (TSCORE.IO.stopWatchingDirectories) {
          TSCORE.IO.stopWatchingDirectories();
        }
        TSCORE.IOUtils.deleteFiles(TSCORE.Utils.getUniqueSelectedFiles());
      }
    );
  }

  function initTagEditDialog() {
    $('.nav-tabs a[href="#geoLocation"]').on('click', function() {
      $('#dateInputCalendar').show();
    });

    $('#editTagButton').on('click', function() {
      TSCORE.TagUtils.renameTag(TSCORE.selectedFiles[0], TSCORE.selectedTag, $('#newTagName').val());
    });

    $('#addTagButton').on('click', function() {
      TSCORE.TagUtils.addTag(TSCORE.selectedFiles, [$('#newTagName').val()]);
    });

    $('#dialogEditTag').draggable({
      handle: ".modal-header > h4"
    });

    $('#dialogEditTag').validator();
    $('#dialogEditTag').on('invalid.bs.validator', function() {
      $('#addTagButton').prop('disabled', true);
      $('#editTagButton').prop('disabled', true);
    });
    $('#dialogEditTag').on('valid.bs.validator', function() {
      $('#addTagButton').prop('disabled', false);
      $('#editTagButton').prop('disabled', false);
    });

    $('#formEditTag').submit(function(e) {
      e.preventDefault();
    });
    $('#dialogEditTag').on('shown.bs.modal', function() {
      $('#newTagName').focus();
      if (TSCORE.PRO) {
        $('#tabGeoLocation').removeClass('disabled');
      } else {
        $('#tabGeoLocation').addClass('disabled');
        $('#tabGeoLocation').click(function(e) {
          e.stopPropagation();
        });
      }
      TSCORE.Calendar.tagRecognition(TSCORE.selectedTag);
      //var data = $('#dateInputCalendar')[0];
      var data = $('#newTagName')[0];
      data.value = TSCORE.selectedTag;
    });
  }

  function showTagEditDialog(addMode) {
    if (addMode) {
      $('#editTagButton').hide();
      $('#addTagButton').show();
    } else {
      $('#editTagButton').show();
      $('#addTagButton').hide();
    }
    $('#newTagName').val(TSCORE.selectedTag);
    $('#dialogEditTag').modal({
      backdrop: 'static',
      show: true
    });
    TSCORE.Calendar.showDateTimeCalendar(TSCORE.selectedTag);
  }

  function showRenameFileDialog() {
    if (TSCORE.selectedFiles[0]) {
      $('#renamedFileName').val(TSCORE.selectedFiles[0]);
      $('#formFileRename').validator();
      $('#formFileRename').submit(function(e) {
        e.preventDefault();
        if ($('#renameFileButton').prop('disabled') === false) {
          $('#renameFileButton').click();
        }
      });
      $('#formFileRename').on('invalid.bs.validator', function() {
        $('#renameFileButton').prop('disabled', true);
      });
      $('#formFileRename').on('valid.bs.validator', function() {
        $('#renameFileButton').prop('disabled', false);
      });
      $('#dialogFileRename').on('shown.bs.modal', function() {
        $('#renamedFileName').focus();
      });
      $('#dialogFileRename').modal({
        backdrop: 'static',
        show: true
      });
      $('#dialogFileRename').draggable({
        handle: ".modal-header"
      });
    } else {
      TSCORE.showAlertDialog("Renaming file failed. Please select a file.");
    }
  }

  function showDirectoryBrowserDialog(path) {
    require([
      'text!templates/DirectoryBrowserDialog.html',
      'tsdirectorybrowser'
    ], function(uiTPL, controller) {
      TSCORE.directoryBrowser = controller;
      if ($('#directoryBrowserDialog').length < 1) {
        var uiTemplate = Handlebars.compile(uiTPL);
        $('body').append(uiTemplate());
        TSCORE.directoryBrowser.initUI();
      }
      $('#directoryBrowserDialog').i18n();
      TSCORE.IOUtils.listSubDirectories(path);
    });
  }

  function showOptionsDialog() {
    require([
      'text!templates/OptionsDialog.html',
      'tsoptions'
    ], function(uiTPL, controller) {
      if ($('#dialogOptions').length < 1) {
        var uiTemplate = Handlebars.compile(uiTPL);
        $('body').append(uiTemplate({isProVersion: TSCORE.PRO ? true : false, isElectron: isElectron ? true : false}));

        controller.initUI();
      }
      $('#dialogOptions').i18n();
      controller.reInitUI();
    });
  }

  function showWelcomeDialog() {
    startGettingStartedTour();
  }

  function showKeysDialog() {
    $('#dialogShortcuts').modal({
      backdrop: 'static',
      show: true,
      open: function() {
        $('.modal-body').val(TSCORE.Config.getSelectAllKeyBinding());
      }
    });
    $('#dialogShortcuts').draggable({
      handle: ".modal-header"
    });
  }

  function startGettingStartedTour() {
    tsGettingStarted = require('tsgettingstarted');
    tsGettingStarted.startTour();
  }

  function stopGettingStartedTour() {
    if (tsGettingStarted) {
      tsGettingStarted.stopTour();
    }
  }

  function showMoveCopyFilesDialog() {
    require(['text!templates/MoveCopyFilesDialog.html'], function(uiTPL) {
      if ($('#dialogMoveCopyFiles').length < 1) {
        var uiTemplate = Handlebars.compile(uiTPL);
        $('body').append(uiTemplate());

        $('#dialogMoveCopyFiles').i18n();
        $('#dialogMoveCopyFiles').draggable({
          handle: '.modal-header'
        });

        $('#moveFilesButton').click(function(e) {
          e.preventDefault();
          // TODO move to ioutils
          TSCORE.showWaitingDialog('Please wait, while files are being renamed.');
          var newFilePath, filePath;
          var fileOperations = [];
          for (var i = 0; i < TSCORE.selectedFiles.length; i++) {
            newFilePath = $('#moveCopyDirectoryPath').val() + TSCORE.dirSeparator + TSCORE.TagUtils.extractFileName(TSCORE.selectedFiles[i]);
            filePath = TSCORE.selectedFiles[i];
            fileOperations.push(TSCORE.IO.renameFilePromise(filePath, newFilePath));
          }
          if (TSCORE.IO.stopWatchingDirectories) {
            TSCORE.IO.stopWatchingDirectories();
          }
          Promise.all(fileOperations).then(function(success) {
            success.forEach(function(operation) {
              TSCORE.Meta.updateMetaData(operation[0], operation[1]);
            });
            TSCORE.hideWaitingDialog();
            TSCORE.navigateToDirectory(TSCORE.currentPath);
            TSCORE.showSuccessDialog("Files successfully moved");
          }, function(err) {
            TSCORE.hideWaitingDialog();
            TSCORE.showAlertDialog("Renaming files failed");
          });
        });

        $('#copyFilesButton').click(function(e) {
          e.preventDefault();
          TSCORE.showWaitingDialog('Please wait, while files are being copied.');
          var newFilePath, filePath;
          var fileOperations = [];
          for (var i = 0; i < TSCORE.selectedFiles.length; i++) {
            var newFilePath = $('#moveCopyDirectoryPath').val() + TSCORE.dirSeparator + TSCORE.TagUtils.extractFileName(TSCORE.selectedFiles[i]);
            var filePath = TSCORE.selectedFiles[i];
            fileOperations.push(TSCORE.IO.copyFilePromise(filePath, newFilePath));
          }
          if (TSCORE.IO.stopWatchingDirectories) {
            TSCORE.IO.stopWatchingDirectories();
          }
          Promise.all(fileOperations).then(function(success) {
            success.forEach(function(operation) {
              TSCORE.Meta.copyMetaData(operation[0], operation[1]);
            });
            TSCORE.hideWaitingDialog();
            TSCORE.navigateToDirectory(TSCORE.currentPath);
            TSCORE.showSuccessDialog("Files successfully copied");
          }, function(err) {
            TSCORE.hideWaitingDialog();
            TSCORE.showAlertDialog("Copying files failed");
          });
        });
        $('#selectDirectoryMoveCopyDialog').click(function(e) {
          e.preventDefault();
          TSCORE.IO.selectDirectory();
        });
      }
      $('#moveCopyDirectoryPath').val(TSCORE.currentPath);
      $('#moveCopyFileList').children().remove();
      for (var i = 0; i < TSCORE.selectedFiles.length; i++) {
        $('#moveCopyFileList').append($('<p>', {
          text: TSCORE.selectedFiles[i]
        }));
      }
      $('#dialogMoveCopyFiles').modal({
        backdrop: 'static',
        show: true
      });
      console.log('Selected files: ' + TSCORE.selectedFiles);
    });
  }

  function showAboutDialog() {
    $('#dialogAboutTS').modal({
      backdrop: 'static',
      show: true
    });
    $('#dialogAboutTS').draggable({
      handle: ".modal-header"
    });
  }

  function showAudioRecordingDialog() {
    if (!TSCORE.currentPath) {
      TSCORE.showAlertDialog($.i18n.t("ns.common:alertOpenLocatioFirst"));
      return;
    }
    if (TSCORE.PRO) {
      $('#audioRecordingDialog').modal({
        backdrop: 'static',
        show: true
      });
      $('#audioRecordingDialog').draggable({
        handle: ".modal-header"
      });
    } else {
      TSCORE.showAlertDialog("You need the PRO version in order to use this functionality.");
    }
  }

  function showLicenseDialog() {
    $('#aboutLicenseModal').modal({
      backdrop: 'static',
      show: true
    });
    $('#aboutLicenseModal').draggable({
      handle: ".modal-header"
    });
    $('#eulaDialogBack').on('click', function() {
      window.close();
    });
  }

  $('#aboutLicenseModal').on('show.bs.modal', reloadEulaContent);

  function reloadEulaContent() {
    if (TSCORE.PRO) {
      $('#eulaIframe').attr('src', 'pro/EULA.txt');
    } else {
      $('#eulaIframe').attr('src', 'LICENSE.txt');
    }
  }

  function disableTopToolbar() {
    $('#perspectiveSwitcherButton').prop('disabled', true);
    $('#searchBox').prop('disabled', true);
    $('#searchButton').prop('disabled', true);
    $('#clearFilterButton').prop('disabled', true);
  }

  function enableTopToolbar() {
    $('#perspectiveSwitcherButton').prop('disabled', false);
    $('#searchBox').prop('disabled', false);
    $('#searchButton').prop('disabled', false);
    $('#clearFilterButton').prop('disabled', false);
  }

  function platformTuning() {
    if (isCordova) {
      $('#directoryMenuOpenDirectory').parent().hide();
      $('#fileMenuOpenDirectory').parent().hide();
      $('#createAudioFileButton').parent().hide();
      $('#openDirectory').parent().hide();
      $('#downloadFile').parent().hide();
      $('#openFileInNewWindow').hide();
      $('#openGooglePlay').hide();
      $('.cancelButton').hide();
    } else if (isCordovaiOS) {
      $('#fullscreenFile').parent().hide();
    } else if (isChrome) {
      // Directory menu
      $('#directoryMenuOpenDirectory').parent().hide();
      $('#directoryMenuRenameDirectory').parent().hide();
      $('#directoryMenuDeleteDirectory').parent().hide();
      $('#directoryMenuCreateDirectory').parent().hide();
      // File menu
      $('#fileMenuOpenDirectory').parent().hide();
      $('#fileMenuOpenNatively').parent().hide();
      $('#fileMenuAddTag').parent().hide();
      $('#fileMenuMoveCopyFile').parent().hide();
      $('#fileMenuRenameFile').parent().hide();
      $('#fileMenuDeleteFile').parent().hide();
      // Tag menu
      $('#tagMenuEditTag').parent().hide();
      $('#tagMenuMoveTagFirst').parent().hide();
      $('#tagMenuMoveTagLeft').parent().hide();
      $('#tagMenuMoveTagRight').parent().hide();
      $('#tagMenuRemoveTag').parent().hide();
      $('#openDirectory').parent().hide();
      // File opener
      $('#tagFile').parent().hide();
      $('#renameFile').parent().hide();
      $('#duplicateFile').parent().hide();
      $('#sendFile').parent().hide();
      $('#deleteFile').parent().hide();
      $('#openNatively').parent().hide();
      $('#addTagFileViewer').hide();
      $('#toggleFileProperitesButton').hide();
      $('#editFileDescriptionButton').remove();
      $('#addTagsFileDescriptionButton').hide();
    } else if (isWeb) {
      $('#directoryMenuOpenDirectory').parent().hide();
      $('#fileMenuOpenDirectory').parent().hide();
      $('#fileMenuOpenNatively').parent().hide();
      $('#openDirectory').parent().hide();
      $('#openNatively').hide();
    } else if (isFirefox) {
      $('#openNatively').hide();
      $('#fileMenuOpenNatively').parent().hide();
    } else if (isNode || isElectron) {
      $('#openFileInNewWindow').hide();
    }
    // Disable send to feature on all platforms except android cordova
    if (!isCordova) {
      $('#sendFile').hide();
      $('#fileMenuSendTo').hide();
    }
    if (isOSX) {
      $('body').addClass('osx');
    }
  }

  function showContextMenu(menuId, sourceObject) {
    var leftPos = sourceObject.offset().left;
    var topPos = sourceObject.offset().top;
    if (sourceObject.offset().top + sourceObject.height() + $(menuId).height() > window.innerHeight) {
      topPos = window.innerHeight - $(menuId).height();
      leftPos = sourceObject.offset().left + 15;
    }
    if (sourceObject.offset().left + sourceObject.width() + $(menuId).width() > window.innerWidth) {
      leftPos = window.innerWidth - $(menuId).width();
    }
    $(menuId).css({
      display: 'block',
      left: leftPos,
      top: topPos
    });
  }

  function hideAllDropDownMenus() {
    $('#tagGroupMenu').hide();
    $('#tagTreeMenu').hide();
    $('#directoryMenu').hide();
    $('#tagMenu').hide();
    $('#fileMenu').hide();
    $('.dirAltNavMenu').hide();
    $('#locationTagTreeMenu').hide();
    //$('#searchOptions').hide();
  }

  function showLocationsPanel() {
    TSCORE.openLeftPanel();
    $('#tagGroupsContent').hide();
    $('#contactUsContent').hide();
    $('#locationContent').show();
    $('#showTagGroups').removeClass('active');
    $('#contactUs').removeClass('active');
    $('#showLocations').addClass('active');
  }

  function showTagsPanel() {
    TSCORE.openLeftPanel();
    $('#locationContent').hide();
    $('#contactUsContent').hide();
    $('#tagGroupsContent').show();
    $('#showLocations').removeClass('active');
    $('#contactUs').removeClass('active');
    $('#showTagGroups').addClass('active');
  }

  function showContactUsPanel() {
    TSCORE.openLeftPanel();
    $('#locationContent').hide();
    $('#tagGroupsContent').hide();
    $('#contactUsContent').show();
    $('#showLocations').removeClass('active');
    $('#showTagGroups').removeClass('active');
    $('#contactUs').addClass('active');
  }

  function setReadOnly() {
    $('#tagMenuEditTag').hide();
    $('#tagTreeMenuEditTag').hide();
    $('#tagFile').hide();
    $('#duplicateFile').hide();
    $('#renameFile').hide();
    $('#addTagFileViewer').hide();
    $('#fileMenuAddTag').hide();
    $('#fileMenuMoveCopyFile').hide();
    $('#fileMenuRenameFile').hide();
    $('#editDocument').hide();

    //$('.flexMaxWidth .editable .editable-click').off('click');

    $(document).off('drop dragend dragenter dragover dragleave', function(event) {
      event.preventDefault();
    });
  }

  function createHTMLFile() {
    if (!TSCORE.currentPath) {
      TSCORE.showAlertDialog($.i18n.t("ns.common:alertOpenLocatioFirst"));
      return;
    }
    var filePath = TSCORE.currentPath + TSCORE.dirSeparator + TSCORE.TagUtils.beginTagContainer + TSCORE.TagUtils.formatDateTime4Tag(new Date(), true) + TSCORE.TagUtils.endTagContainer + '.html';
    createNewTextFile(filePath, TSCORE.Config.getNewHTMLFileContent());
  }

  function createMDFile() {
    if (!TSCORE.currentPath) {
      TSCORE.showAlertDialog($.i18n.t("ns.common:alertOpenLocatioFirst"));
      return;
    }
    var filePath = TSCORE.currentPath + TSCORE.dirSeparator + TSCORE.TagUtils.beginTagContainer + TSCORE.TagUtils.formatDateTime4Tag(new Date(), true) + TSCORE.TagUtils.endTagContainer + '.md';
    createNewTextFile(filePath, TSCORE.Config.getNewMDFileContent());
  }

  function createTXTFile() {
    if (!TSCORE.currentPath) {
      TSCORE.showAlertDialog($.i18n.t("ns.common:alertOpenLocatioFirst"));
      return;
    }
    var filePath = TSCORE.currentPath + TSCORE.dirSeparator + TSCORE.TagUtils.beginTagContainer + TSCORE.TagUtils.formatDateTime4Tag(new Date(), true) + TSCORE.TagUtils.endTagContainer + '.txt';
    createNewTextFile(filePath, TSCORE.Config.getNewTextFileContent());
  }

  function createNewTextFile(filePath, content) {
    TSCORE.IO.saveFilePromise(filePath, content).then(function(isNewFile) {
      TSCORE.PerspectiveManager.refreshFileListContainer();
      TSCORE.FileOpener.openFile(filePath, true);
      TSCORE.showSuccessDialog("File created successfully."); // TODO translate
    }, function(error) {
      TSCORE.hideLoadingAnimation();
      console.log("Creating the " + filePath + " failed " + error);
      TSCORE.showAlertDialog("Creating " + filePath + " failed.");
    });
  }

  function openFacebook() {
    TSCORE.IO.openFile("https://www.facebook.com/tagspacesapp");
  }

  function openTwitter() {
    TSCORE.IO.openFile("https://twitter.com/intent/user?screen_name=tagspaces");
  }

  function openGooglePlus() {
    TSCORE.IO.openFile("https://plus.google.com/+TagspacesOrg/");
  }

  function suggestNewFeatures() {
    TSCORE.IO.openFile("https://trello.com/b/TGeG5bi9");
  }

  function reportIssues() {
    TSCORE.IO.openFile("https://github.com/tagspaces/tagspaces/issues/");
  }

  function whatsNew() {
    TSCORE.IO.openFile("http://www.tagspaces.org/whatsnew/");
  }

  function showDocumentation() {
    TSCORE.IO.openFile("http://docs.tagspaces.org");
  }

  // Public API definition
  exports.showContextMenu = showContextMenu;
  exports.initUI = initUI;
  exports.enableTopToolbar = enableTopToolbar;
  exports.disableTopToolbar = disableTopToolbar;
  exports.hideWaitingDialog = hideWaitingDialog;
  exports.showWaitingDialog = showWaitingDialog;
  exports.showAlertDialog = showAlertDialog;
  exports.showSuccessDialog = showSuccessDialog;
  exports.showConfirmDialog = showConfirmDialog;
  exports.showFileRenameDialog = showFileRenameDialog;
  exports.showRenameFileDialog = showRenameFileDialog;
  exports.showFileCreateDialog = showFileCreateDialog;
  exports.showFileDeleteDialog = showFileDeleteDialog;
  exports.showDeleteFilesDialog = showDeleteFilesDialog;
  exports.showWelcomeDialog = showWelcomeDialog;
  exports.showKeysDialog = showKeysDialog;
  exports.startGettingStartedTour = startGettingStartedTour;
  exports.stopGettingStartedTour = stopGettingStartedTour;
  exports.showTagEditDialog = showTagEditDialog;
  //exports.showDateTimeCalendar = showDateTimeCalendar;
  exports.showOptionsDialog = showOptionsDialog;
  exports.showAboutDialog = showAboutDialog;
  exports.showAudioRecordingDialog = showAudioRecordingDialog;
  exports.showLicenseDialog = showLicenseDialog;
  exports.showLocationsPanel = showLocationsPanel;
  exports.showTagsPanel = showTagsPanel;
  exports.showContactUsPanel = showContactUsPanel;
  exports.showDirectoryBrowserDialog = showDirectoryBrowserDialog;
  exports.showMoveCopyFilesDialog = showMoveCopyFilesDialog;
  exports.hideAllDropDownMenus = hideAllDropDownMenus;
  exports.createHTMLFile = createHTMLFile;
  exports.createMDFile = createMDFile;
  exports.createTXTFile = createTXTFile;
  exports.openNewInstance = openNewInstance;
  exports.openFacebook = openFacebook;
  exports.openTwitter = openTwitter;
  exports.openGooglePlus = openGooglePlus;
  exports.suggestNewFeatures = suggestNewFeatures;
  exports.reportIssues = reportIssues;
  exports.whatsNew = whatsNew;
  exports.showDocumentation = showDocumentation;
  exports.setReadOnly = setReadOnly;
});
