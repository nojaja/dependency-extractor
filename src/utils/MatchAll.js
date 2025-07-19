import log4js from 'log4js';

// ロガーの設定
log4js.configure({
  appenders: {
    console: { type: 'console' }
  },
  categories: {
    default: { appenders: ['console'], level: 'info' }
  }
});

const logger = log4js.getLogger('dirWalker');

export class MatchAll {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(debug = false) {
    this.debug = debug;
  }

  match(text, patterns) {
    return (this.matchEx(text, patterns))? true: false;
  }

  matchList(list) {
    for (const obj of list) {
        const ret = this.matchEx(obj[0], obj[1]);
        if(ret) {
            return ret;
        }
    }
    return null;
  }

  matchEx(text, patterns) {
    try {
        if(!patterns)return null;
        for (const pattern of patterns) {
            if (pattern!=null && pattern.test && pattern.test(text)) {
                return pattern;
            }
        }
        return null;
    } catch (error) {
        logger.error(`正規表現マッチングエラー: ${error.message}`);
    }
  }

  compareBuf(buffer, patterns) {
    try {
        if(!patterns)return null;
        for (const pattern of patterns) {
            if (pattern.length <= buffer.length && pattern.compare(buffer.slice(0,pattern.length))==0) {
                return true;
            }
        }
        return false;
    } catch (error) {
        logger.error(`正規表現バッファ比較エラー: ${error.message}`);
    }
  }
}
export default MatchAll;