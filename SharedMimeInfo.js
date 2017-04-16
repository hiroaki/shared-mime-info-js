function SharedMimeInfo() {
  this.initialize.apply(this, arguments);
}

SharedMimeInfo.readFileAsArrayBuffer = function(file) {
  console.debug('reading ['+ file.name +'] as ArrayBuffer');
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function(e) {
      console.debug('read ['+ e.target.result.byteLength +'] bytes');
      resolve(e.target.result); // ArrayBuffer
    };
    reader.readAsArrayBuffer(file);
  });
};

SharedMimeInfo.setupMimeDatabaseByUrl = function(url) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'text';
    xhr.onload = function(evt) {
      if (this.readyState === 4) {
        console.debug('loaded xml: '+ this.status);
        if (this.status === 200 || this.status === 0) {
          resolve(this.response);
        }
        else {
          reject();
        }
      }
    };
    xhr.send();
  })
  .then(function(xml_text) {
    var list, i, l, pat, xml_document;
    xml_document = (new DOMParser()).parseFromString(xml_text, 'text/xml');
    console.debug(xml_document.getElementsByTagName('mime-type').length +' mime-types');
    list = xml_document.getElementsByTagName('glob');
    console.debug(list.length + ' glob petterns');
    // for (i = 0, l = list.length; i < l; ++i ) {
    //   console.debug(list[i].getAttribute('pattern'));
    // }
    return Promise.resolve(xml_document);
  });
};

SharedMimeInfo._detectComment = function(mimeType, lang) {
  return Array.prototype.find.call(mimeType.getElementsByTagName('comment'), function(i) { return i.getAttribute('xml:lang') === lang });
};

SharedMimeInfo.detectComment = function(mimeType, lang) {
  var comment = null;
  lang = (lang || 'en').replace(/-.*$/, '');
  comment = this._detectComment(mimeType, lang);
  if (!comment && lang !== 'en') {
    comment = this._detectComment(mimeType, 'en');
  }
  return comment;
};

SharedMimeInfo.isMatchType = function(arrayBuffer, type, value, offset, mask) {
  var endian, unit, typeParsed, sourceBytes, typedArray, spec, target, len, offsetRange, offsetHead, offsetTail, i, l, tmp, maskArray;

  offsetRange = (offset.toString() || '0').split(':').map(function(i) { return parseInt(i) });
  offsetHead  = offsetRange[0];
  offsetTail  = offsetRange[1];
  if (isNaN(offsetTail)) {
    offsetTail = offsetHead;
  }
  if (offsetTail < offsetHead) {
    throw new Error('Invalid value of offset');
  }

  console.debug(['#isMatchType -',
    ' type: ', type,
    ' value: ', value,
    ' offset: ', offset,
    ' mask: ', mask,
    ' buffer.byteLength: ', arrayBuffer.byteLength,
    ' offsetHead: ', offsetHead,
    ' offsetTail: ', offsetTail
  ].join(''));

  if (type === 'big16' || type === 'big32' || type === 'little16' || type === 'little32') {
    typeParsed = type.match(/(big|little)(\d+)/);
    endian  = typeParsed[1] === 'big' ? false : true;
    unit    = typeParsed[2];
    len     = parseInt(unit) / 8;
    for (i = offsetHead; i <= offsetTail; ++i) {
        spec = Number(parseInt(value, value.match(/^0x/) ? 16 : 10)).toString(16);
        target = Number(new DataView(arrayBuffer, i, len)['getUint'+ unit](i, endian)).toString(16);
        if (mask) {
          spec = this.applyMaskToBytesArray(mask, spec.match(/[0-9a-f]{2}/g).map(function(curr){ return parseInt(curr, 16) }));
          target = this.applyMaskToBytesArray(mask, target.match(/[0-9a-f]{2}/g).map(function(curr){ return parseInt(curr, 16) }));
        }
        console.debug('spec   = ['+ spec.toString() +']');
        console.debug('target = ['+ target.toString() +']');
        if (target.toString() === spec.toString()) {
          return true;
        }
    }
    return false;
  }
  else if (type === 'string') {
    sourceBytes = this.stringToSourceBytes(value);
    len = sourceBytes.length;
    for (i = offsetHead; i <= offsetTail; ++i) {
      target = (new Uint8Array(arrayBuffer)).subarray(i, i + len);
      if (mask) {
        target = this.applyMaskToBytesArray(mask, target);
        sourceBytes = this.applyMaskToBytesArray(mask, sourceBytes);
      }
      console.debug('spec   = ['+ sourceBytes.toString() +']');
      console.debug('target = ['+ target.toString() +']');
      if (target.toString() === sourceBytes.toString()) {
        return true;
      }
    }
    return false;
  }
  else if (type === 'byte') {
    if (mask) {
      throw new Error('Is there a mask even if type is byte?');
    }
    for (i = offsetHead; i <= offsetTail; ++i) {
      if (parseInt(value, value.match(/^0x/) ? 16 : 10) === new Uint8Array(arrayBuffer, i, 1)[0]) {
        return true;
      }
    }
    return false;
  }
  else if (type === 'host16' || type === 'host32') {
    typedArray = type === 'host16' ? Uint16Array : Uint32Array;

    sourceBytes = (function(value) {
      var match, bytes;

      match = value.match(/^([0-9]+)$/);
      if (match) {
        bytes = match[1].toLowerCase().match(/[0-9]{1}/g);
        return bytes.map(function(byte) { return byte.toString().charCodeAt() });
      }

      match = value.toLowerCase().match(/0x([0-9a-f]+)/);
      if (match) {
        bytes = match[1].toLowerCase().match(/[0-9a-f]{2}/g);
        return bytes.map(function(byte) { return parseInt(byte, 16) });
      }

      throw new Error('Unknown type of value');
    }(value));

    spec = (function() {
      var ui8 = new Uint8Array(new ArrayBuffer(sourceBytes.length), 0, sourceBytes.length);
      ui8.set(sourceBytes);
      return new typedArray(ui8.buffer, 0, ui8.length / typedArray.BYTES_PER_ELEMENT);
    }());
    //------------------
    len = sourceBytes.length / typedArray.BYTES_PER_ELEMENT;
    for (i = offsetHead; i <= offsetTail; ++i) {
      target = new typedArray(arrayBuffer, i, len);

      if (mask) {
        throw new Error('mask is unsupported yet');
      }
      console.debug('spec   = ['+ spec.toString() +']');
      console.debug('target = ['+ target.toString() +']');
      if (spec.toString() === target.toString()) {
        return true;
      }
    }
    return false;
  }
  else {
    throw new Error('Unknown type');
  }
};

SharedMimeInfo.applyMaskToBytesArray = function(maskSource, targetBytes) {
  var maskBytes, maskedBytes;
  if (maskSource.match(/^0x/)) {
    maskBytes = maskSource.replace(/0x/, '').toLowerCase().match(/[0-9a-f]{2}/g).map(function(curr) { return parseInt(curr, 16) });
  }
  else if (maskSource.match(/^[0-9]+$/)) {
    throw new Error('mask value is unsupported yet');
  }
  else {
    throw new Error('mask value is invalid');
  }
  if (targetBytes.length != maskBytes.length) {
    throw new Error('mask value does not have enough length');
  }
  maskedBytes = [];
  for (i = 0, l = targetBytes.length; i < l; ++i ) {
    maskedBytes.push(targetBytes[i] & maskBytes[i]);
  }
  return maskedBytes;
};

SharedMimeInfo.stringToSourceBytes = function(str) {
  var chars = str.split(''), buf = [], i, l;
  for (i = 0, l = chars.length; i < l; ++i ) {
    if (chars[i] === '\\') {
      if (chars[i + 1].toLowerCase() === 'x') {
        buf.push(parseInt(chars[i + 2] + chars[i + 3], 16));
        i += 3;
        continue;
      }
      else if (!isNaN(parseInt(chars[i + 1]), 8) && !isNaN(parseInt(chars[i + 2]), 8) && !isNaN(parseInt(chars[i + 3]), 8)) {
        buf.push(parseInt(chars[i + 1] + chars[i + 2] + chars[i + 3], 8));
        i += 3;
        continue;
      }
      else if (!isNaN(parseInt(chars[i + 1]), 8) && !isNaN(parseInt(chars[i + 2]), 8)) {
        buf.push(parseInt(chars[i + 1] + chars[i + 2], 8));
        i += 2;
        continue;
      }
      else if (!isNaN(parseInt(chars[i + 1]), 8)) {
        buf.push(parseInt(chars[i + 1], 8));
        i += 1;
        continue;
      }
      else if (chars[i + 1] == '"') {
        buf.push(chars[i + 1].charCodeAt());
        i += 1;
        continue;
      }
      else if (chars[i + 1] == 'n') {
        buf.push("\x0a");
        i += 1;
        continue;
      }
      throw new Error('invalid escaping at '+ i);
    }
    else {
      buf.push(chars[i].charCodeAt());
    }
  }
  return buf;
};

SharedMimeInfo.checkMatchElements = function(arrayBuffer, matchElements) {
  var i, l, m;
  if (matchElements.length === 0) {
    return true;
  }
  for (i = 0, l = matchElements.length; i < l; ++i) {
    console.debug('<<< matchElements['+ i +'] >>>');
    m = matchElements[i];
    if (this.isMatchType(arrayBuffer, m.getAttribute('type'), m.getAttribute('value'), m.getAttribute('offset'), m.getAttribute('mask'))) {
      if (this.checkMatchElements(arrayBuffer, m.getElementsByTagName('match'))) {
        return true;
      }
    }
  }
  return false;
};

SharedMimeInfo.checkMagicElement = function(arrayBuffer, magicElement) {
  var matches;
  matches = magicElement.getElementsByTagName('match');
  if (matches.length === 0) {
    throw new Error('this <mime-type> does not have <match> elements?');
  }
  return this.checkMatchElements(arrayBuffer, matches);
};

SharedMimeInfo.matchedMagicByMimeTypeElement = function(arrayBuffer, mimeType) {
  var magics, i, l;
  magics = mimeType.getElementsByTagName('magic');
  for (i = 0, l = magics.length; i < l; ++i) {
    if (this.checkMagicElement(arrayBuffer, magics[i])) {
      return magics[i];
    }
  }
  return null;
};

SharedMimeInfo.prototype.class = SharedMimeInfo;

SharedMimeInfo.prototype.initialize = function(freedesktop_org_xml) {
  this.source = freedesktop_org_xml;
  this.queue = [];
  this.xml = null;
  this.class.setupMimeDatabaseByUrl(this.source).then(function(xml_document) {
    this.xml = xml_document;
    this.flash();
  }.bind(this));
};

SharedMimeInfo.prototype.flash = function() {
  var task;
  if (this.xml) {
    while (task = this.queue.shift()) {
      console.debug("flash calls a task");
      task.call();
    }
  }
};

SharedMimeInfo.prototype.ready = function() {
  var promise = new Promise(function(resolve, reject) {
      this.queue.push(resolve);
  }.bind(this));
  this.flash();
  return promise;
};

SharedMimeInfo.prototype.detectMimeTypeNodesByGlobOfFile = function(file) {
  var i, l, pat, mimeTypes = [],
      list = this.xml.getElementsByTagName('glob');
  for (i = 0, l = list.length; i < l; ++i ) {
    pat = list[i].getAttribute('pattern');
    if (globToRegExp(pat, { extended: true, flags: 'i' }).test(file.name)) {
      console.debug('matched glob ['+ pat +'] detected mime-type ['+ list[i].parentNode.getAttribute('type')+ ']');
      mimeTypes.push(list[i].parentNode);
    }
  }
  return mimeTypes;
};

SharedMimeInfo.prototype.detectMimeTypeNodesByMagicOfFile = function(file) {
  throw new Error('#detectMimeTypeNodesByMagicOfFile is not implemented yet');
};

SharedMimeInfo.prototype.mimeType = function(file) {
  return this
    .ready()
    .then(function() {
      var mimeTypes;
      console.debug('target File.name: ' + file.name);
      console.debug('target File.type: ' + file.type);
      console.debug('target File.size: ' + file.size);

      console.debug('-- GLOB --');
      mimeTypes = this.detectMimeTypeNodesByGlobOfFile(file);
      if (mimeTypes.length === 0) {
        console.debug('there is no glob pattern');
        return;
      }

      console.debug('-- Magic --');
      return this.class.readFileAsArrayBuffer(file).then(function(arrayBuffer) {
        var i, l, matchedMagic, matchedMimeTypes = [];
        for (i = 0, l = mimeTypes.length; i < l; ++i) {
          console.debug('-- '+ mimeTypes[i].getAttribute('type'));
          matchedMagic = this.class.matchedMagicByMimeTypeElement(arrayBuffer, mimeTypes[i]);
          if (matchedMagic) {
            console.debug('magic matches');
            matchedMimeTypes.push({ node: mimeTypes[i], priority: parseInt(matchedMagic.getAttribute('priority') || '50') });
          }
          else {
            console.debug('magic dose not match');
          }
        }

        if (matchedMimeTypes.length === 0) {
          return null;
        }
        if (matchedMimeTypes.length === 1) {
          return matchedMimeTypes[0].node || null;
        }
        return matchedMimeTypes.sort(function(a, b) { return b.priority - a.priority })[0].node || null;
      }.bind(this));
    }.bind(this))
    .catch(function() {
      console.error(arguments);
    });
}
