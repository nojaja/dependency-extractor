import { readFile } from 'fs/promises';
import { existsSync, unlinkSync } from 'fs';
import * as path from 'path';
import { execa } from 'execa';
import { XMLParser } from 'fast-xml-parser';
import log4js from 'log4js';

const logger = log4js.getLogger('mavenExtractor');

/**
 * Maven（Java）プロジェクトの依存関係抽出クラス
 */
export class MavenExtractor {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(debug = false) {
    this.debug = debug;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      allowBooleanAttributes: true
    });
  }

  /**
   * Maven プロジェクトから依存関係を抽出する
   * @param {string} projectPath - pom.xmlが存在するディレクトリパス
   * @param {string} projectRelativePath - リポジトリルートからの相対パス
   * @returns {Promise<Array<Object>>} - 抽出された依存関係のリスト
   */
  async extractDependencies(projectPath, projectRelativePath) {
    logger.info(`Maven依存関係を抽出中: ${projectPath}`);
    const dependencies = [];

    try {
      // pom.xmlのパス
      const pomPath = path.join(projectPath, 'pom.xml');
      // pom.xml存在確認
      if (!existsSync(pomPath)) {
        logger.warn('pom.xmlが見つかりません');
        return [];
      }
      // mvn installを実行
      try {
        logger.info('mvn installを実行して依存関係をインストールします');
        const { stdout, stderr, exitCode } = await execa('mvn', ['install', '-DskipTests'], {
          cwd: projectPath,
          shell: true,
          timeout: 60000 // 60秒
        });
        if (stderr) logger.warn(`mvn install 標準エラー: ${stderr}`);
        if (this.debug && stdout) logger.debug(`mvn install 標準出力: ${stdout}`);
        if (exitCode !== 0) logger.warn(`mvn installが異常終了しました (exit code: ${exitCode})`);
      } catch (installError) {
        logger.error(`mvn install実行エラー: ${installError.message}`);
        // インストール失敗時も続行
      }
      // effective-pomを生成するためのパス
      const effectivePomPath = path.join(projectPath, 'effective-pom.xml');
      try {        // まず通常のpom.xmlから基本情報を読み取る
        const pomContent = await readFile(pomPath, 'utf8');
        const pomData = this.xmlParser.parse(pomContent);
        // mvn help:effective-pomコマンドを実行
        logger.info(`effective-pomを生成中: ${projectPath}`);
        try {
          // execaでmvnコマンドを実行
          const { stdout, stderr, exitCode } = await execa('mvn', ['help:effective-pom', `-Doutput=${effectivePomPath}`], {
            cwd: projectPath,
            shell: true,
            timeout: 60000 // 60秒に延長
          });
          if (stderr) logger.warn(`mvn標準エラー: ${stderr}`);
          if (this.debug && stdout) logger.info(`mvn標準出力: ${stdout}`);
          if (exitCode !== 0) throw new Error(`mvnコマンドが異常終了しました (exit code: ${exitCode})`);
        } catch (execError) {
          if (execError.timedOut) {
            logger.warn(`mvnコマンドがタイムアウトしました: ${execError.message}`);
          } else {
            logger.error(`mvnコマンド実行エラー: ${execError.message}`);
          }
          // タイムアウト・その他エラー時もフォールバック処理を継続
        }
        // effective-pomを読み込む前に存在確認
        if (existsSync(effectivePomPath)) {
          if (this.debug) logger.info(`effective-pom生成成功: ${effectivePomPath}`);
          const effectivePomContent = await readFile(effectivePomPath, 'utf8');
          const effectivePomData = this.xmlParser.parse(effectivePomContent);
          // プロジェクトデータ取得
          const projectData = effectivePomData.project;
          if (projectData && projectData.dependencies && projectData.dependencies.dependency) {
            const projectPathForCsv = path.join(
              path.dirname(projectRelativePath), 
              'pom.xml'
            );
            // 依存関係リストを取得
            const deps = Array.isArray(projectData.dependencies.dependency) 
              ? projectData.dependencies.dependency 
              : [projectData.dependencies.dependency];
            for (const dep of deps) {
              dependencies.push({
                projectType: 'MAVEN',
                projectPath: projectPathForCsv,
                dependencyName: `${dep.groupId}:${dep.artifactId}`,
                dependencyVersion: dep.version || 'unknown',
                isDev: dep.scope === 'test'
              });
            }
          }
          // 一時ファイルを削除
          // try {
          //   unlinkSync(effectivePomPath);
          // } catch (error) {
          //   logger.warn(`effective-pomファイル削除エラー: ${error.message}`);
          // }
        } else {
          logger.warn(`effective-pom.xmlが生成されませんでした。pom.xmlのみから抽出します`);
          // effective-pom生成に失敗した場合は、通常のpom.xmlから依存関係を抽出
          if (pomData.project && pomData.project.dependencies && pomData.project.dependencies.dependency) {
            const projectPathForCsv = path.join(
              path.dirname(projectRelativePath), 
              'pom.xml'
            );
            const deps = Array.isArray(pomData.project.dependencies.dependency) 
              ? pomData.project.dependencies.dependency 
              : [pomData.project.dependencies.dependency];
            for (const dep of deps) {
              dependencies.push({
                projectType: 'MAVEN',
                projectPath: projectPathForCsv,
                dependencyName: `${dep.groupId}:${dep.artifactId}`,
                dependencyVersion: dep.version || 'unknown',
                isDev: dep.scope === 'test'
              });
            }
          }
        }
        
      } catch (fileError) {
        logger.error(`pom.xmlの読み込みエラー: ${fileError.message}`);
        return [];
      }
      
      logger.info(`Mavenプロジェクトから${dependencies.length}の依存関係を抽出しました`);
      return dependencies;
    } catch (error) {
      logger.error(`Maven依存関係抽出エラー: ${error.message}`);
      return [];
    }
  }
}

export default MavenExtractor;
