'use strict';

(function () {
  function parseURL (text) {
    const xml = new window.DOMParser().parseFromString(text, 'text/xml')
    const tag = xml.getElementsByTagName('Key')[0]
    return decodeURI(tag.childNodes[0].nodeValue)
  }

  function waitForAllFiles (form) {
    if (window.uploading !== 0) {
      setTimeout(function () {
        waitForAllFiles(form)
      }, 100)
    } else {
      window.HTMLFormElement.prototype.submit.call(form)
    }
  }

  function request (method, url, data, fileInput, file, form) {
    file.loaded = 0
    return new Promise(function (resolve, reject) {
      const xhr = new window.XMLHttpRequest()

      xhr.onload = function () {
        if (xhr.status === 201) {
          resolve(xhr.responseText)
        } else {
          reject(xhr.statusText)
        }
      }

      xhr.upload.onprogress = function (e) {
        const diff = e.loaded - file.loaded
        form.loaded += diff
        fileInput.loaded += diff
        file.loaded = e.loaded
        const defaultEventData = {
          currentFile: file,
          currentFileName: file.name,
          currentFileProgress: Math.min(e.loaded / e.total, 1),
          originalEvent: e
        }
        form.dispatchEvent(new window.CustomEvent('progress', {
          detail: Object.assign({
            progress: Math.min(form.loaded / form.total, 1),
            loaded: form.loaded,
            total: form.total
          }, defaultEventData)
        }))
        fileInput.dispatchEvent(new window.CustomEvent('progress', {
          detail: Object.assign({
            progress: Math.min(fileInput.loaded / fileInput.total, 1),
            loaded: fileInput.loaded,
            total: fileInput.total
          }, defaultEventData)
        }))
      }

      xhr.onerror = function () {
        reject(xhr.statusText)
      }

      xhr.open(method, url)
      xhr.send(data)
    })
  }

  function uploadFiles (form, fileInput, name) {
    const url = fileInput.getAttribute('data-url')
    fileInput.loaded = 0
    fileInput.total = 0
    const promises = Array.from(fileInput.files).map(function (file) {
      form.total += file.size
      fileInput.total += file.size
      const s3Form = new window.FormData()
      Array.from(fileInput.attributes).forEach(function (attr) {
        let name = attr.name

        if (name.startsWith('data-fields')) {
          name = name.replace('data-fields-', '')
          s3Form.append(name, attr.value)
        }
      })
      s3Form.append('success_action_status', '201')
      s3Form.append('Content-Type', file.type)
      s3Form.append('file', file)
      return request('POST', url, s3Form, fileInput, file, form)
    })
    Promise.all(promises).then(function (results) {
      results.forEach(function (result) {
        const hiddenFileInput = document.createElement('input')
        hiddenFileInput.type = 'hidden'
        hiddenFileInput.name = name
        hiddenFileInput.value = parseURL(result)
        form.appendChild(hiddenFileInput)
      })
      fileInput.name = ''
      window.uploading -= 1
    }, function (err) {
      console.log(err)
      fileInput.setCustomValidity(err)
      fileInput.reportValidity()
    })
  }

  function uploadS3Inputs (event) {
    event.preventDefault()

    const form = event.target
    const submitter = event.submitter

    window.uploading = 0
    form.loaded = 0
    form.total = 0
    const inputs = Array.from(form.querySelectorAll('input[type=file].s3file'))

    inputs.forEach(function (input) {
      const hiddenS3Input = document.createElement('input')
      hiddenS3Input.type = 'hidden'
      hiddenS3Input.name = 's3file'
      hiddenS3Input.value = input.name
      form.appendChild(hiddenS3Input)
      const hiddenSignatureInput = document.createElement('input')
      hiddenSignatureInput.type = 'hidden'
      hiddenSignatureInput.name = input.name + '-s3f-signature'
      hiddenSignatureInput.value = input.dataset.s3fSignature
      form.appendChild(hiddenSignatureInput)
    })
    inputs.forEach(function (input) {
      window.uploading += 1
      uploadFiles(form, input, input.name)
    })

    if (submitter) {
      // override form attributes with submit button attributes
      form.action = submitter.getAttribute('formaction') || form.action
      form.method = submitter.getAttribute('formmethod') || form.method
      form.enctype = submitter.getAttribute('formEnctype') || form.enctype
      form.novalidate = submitter.getAttribute('formnovalidate') || form.novalidate
      form.target = submitter.getAttribute('formtarget') || form.target
      // add submit button value to form
      const submitInput = document.createElement('input')
      submitInput.type = 'hidden'
      submitInput.value = submitter.value || '1'
      submitInput.name = submitter.name
      form.appendChild(submitInput)
    }

    waitForAllFiles(form)
  }

  document.addEventListener('DOMContentLoaded', function () {
    let forms = Array.from(document.querySelectorAll('input[type=file].s3file')).map(function (input) {
      return input.closest('form')
    })
    forms = new Set(forms)
    forms.forEach(function (form) {
      form.addEventListener('submit', uploadS3Inputs)
    })
  })
})()
