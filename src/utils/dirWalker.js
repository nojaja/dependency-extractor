import * as fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import * as path from 'path';
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

/**
 * ディレクトリを再帰的に走査するユーティリティクラス
 */
export class DirWalker {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(debug = false) {
    this.debug = debug;
    this.counter = 0;
  }

  /**
   * ディレクトリを再帰的に走査し、指定された条件に合致するファイルを処理する
   * @param {string} targetPath - 走査対象のディレクトリパス
   * @param {Object} settings - 設定オブジェクト
   * @param {Function} fileCallback - ファイル発見時のコールバック関数 (relativePath, settings) => {}
   * @param {Function} errCallback - エラー発生時のコールバック関数 (error) => {}
   * @returns {Promise<number>} - 処理したファイル数
   */
  async walk(targetPath, settings = {}, fileCallback, errCallback) {
    this.counter = 0;
    const _settings = { ...settings };
    
    await this._walk(targetPath, targetPath, _settings, fileCallback, errCallback);
    
    return this.counter;
  }

  /**
   * 内部で再帰的に使用される走査メソッド
   * @private
   */
  async _walk(targetPath, basePath, settings, fileCallback, errCallback) {
    try {
      // ディレクトリ内のファイル一覧を取得
      const files = await fs.readdir(targetPath);
      
      // 各ファイルを処理
      for (const file of files) {
        const filePath = path.resolve(targetPath, file);
        
        try {
          // ファイルの情報を取得
          const stat = await fs.stat(filePath);
          
          // シンボリックリンクの場合はスキップ
          if (stat.isSymbolicLink()) {
            if (this.debug) logger.debug(`シンボリックリンクをスキップ: ${filePath}`);
            continue;
          }
          
          if (stat.isDirectory()) {
            // ディレクトリの場合は再帰的に処理
            await this._walk(filePath, basePath, settings, fileCallback, errCallback);
          } else {
            // ファイルの場合はカウンタをインクリメントしてコールバックを実行
            this.counter++;
            if (this.debug) logger.debug(`ファイル発見: ${filePath}`);
            
            // 相対パスを計算
            const relativePath = path.relative(basePath, filePath);
            
            try {
              await fileCallback(relativePath, settings);
            } catch (error) {
              this._handleError(
                `ファイル処理エラー: ${filePath}`, 
                error, 
                errCallback
              );
            }
          }
        } catch (error) {
          // ファイル情報取得エラーの処理
          this._handleError(
            `ファイル情報取得エラー: ${filePath}`, 
            error, 
            errCallback
          );
        }
      }
    } catch (error) {
      // ディレクトリ読み取りエラーの処理
      this._handleError(
        `ディレクトリ読み取りエラー: ${targetPath}`, 
        error, 
        errCallback
      );
    }
  }

  /**
   * エラーを処理するヘルパーメソッド
   * @private
   */
  _handleError(message, error, errCallback) {
    if (typeof errCallback === 'function') {
      errCallback(error);
    } else {
      logger.error(`${message}: ${error.message}`);
    }
  }
}

export default DirWalker;
