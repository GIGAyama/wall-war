/**
 * @OnlyCurrentDoc
 * このスクリプトは現在開いているドキュメントにのみアクセスします。
 */

//================================================================
// 1. Webアプリケーションのメインエントリーポイント
//================================================================

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('コリドール')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


//================================================================
// 2. フロントエンドから呼び出されるAPI関数
//================================================================

// ▼ 変更点: ゲームの状態を保存するキーを、プレイヤーIDごとに変えるための「接頭辞」に変更
const GAME_STATE_KEY_PREFIX = 'gameState_';

/**
 * ゲームを初期化する。
 * @param {number} boardSize - 盤面のサイズ (奇数)。
 * @param {string} playerId - ブラウザごとにユニークなプレイヤーID。
 * @returns {object} - 初期化されたゲーム状態オブジェクト。
 */
function initializeGame(boardSize, playerId) {
  const wallCount = Math.floor((boardSize * boardSize - 1) / 8);
  const startRow = Math.floor(boardSize / 2);

  const initialGameState = {
    boardSize: boardSize,
    currentPlayer: 1,
    players: {
      '1': { row: startRow, col: 0, walls: wallCount, goalCol: boardSize - 1 },
      '2': { row: startRow, col: boardSize - 1, walls: wallCount, goalCol: 0 },
    },
    walls: [],
    winner: null,
    message: `プレイヤー１のターン`,
  };

  // ▼ 変更点: プレイヤーIDを含んだキーでゲーム状態を保存
  const gameStateKey = GAME_STATE_KEY_PREFIX + playerId;
  PropertiesService.getScriptProperties().setProperty(gameStateKey, JSON.stringify(initialGameState));

  return initialGameState;
}

/**
 * プレイヤーのアクション（コマ移動 or 壁設置）を処理する。
 * @param {object} action - { type: 'move'/'wall', data: {...} }
 * @param {string} playerId - ブラウザごとにユニークなプレイヤーID。
 * @returns {object} - 更新されたゲーム状態オブジェクト。
 */
function processPlayerAction(action, playerId) {
  // ▼ 変更点: プレイヤーIDを含んだキーでゲーム状態を読み込み
  const gameStateKey = GAME_STATE_KEY_PREFIX + playerId;
  const gameStateJSON = PropertiesService.getScriptProperties().getProperty(gameStateKey);

  // もし何らかの理由でデータがなければ、エラーを返す
  if (!gameStateJSON) {
    return { error: true, message: "ゲームのデータが見つからなかったよ。もう一度ページを読み込んでね。" };
  }
  const gameState = JSON.parse(gameStateJSON);

  // 勝者が決まっている場合は何もしない
  if (gameState.winner) {
    return gameState;
  }

  const { type, data } = action;
  const player = gameState.currentPlayer;

  if (type === 'move') {
    const { newRow, newCol } = data;
    const validation = validateMove(gameState, player, newRow, newCol);
    if (validation.isValid) {
      gameState.players[player].row = newRow;
      gameState.players[player].col = newCol;
      if (checkWinCondition(gameState, player)) {
        gameState.winner = player;
        gameState.message = `🎉プレイヤー${player}の勝ち！おめでとう！🎉`;
      } else {
        gameState.currentPlayer = player === 1 ? 2 : 1;
        gameState.message = `プレイヤー${gameState.currentPlayer}のターン`;
      }
    } else {
      gameState.message = validation.message;
    }
  } else if (type === 'wall') {
    const { row, col, orientation } = data;
    const validation = validateWallPlacement(gameState, player, row, col, orientation);
    if (validation.isValid) {
      gameState.players[player].walls--;
      gameState.walls.push({ row, col, orientation });
      gameState.currentPlayer = player === 1 ? 2 : 1;
      gameState.message = `プレイヤー${gameState.currentPlayer}のターン`;
    } else {
      gameState.message = validation.message;
    }
  }

  // ▼ 変更点: 更新されたゲーム状態を、同じプレイヤーIDのキーで保存
  PropertiesService.getScriptProperties().setProperty(gameStateKey, JSON.stringify(gameState));
  return gameState;
}


//================================================================
// 3. ゲームルールの検証ロジック
//================================================================

function validateMove(gameState, player, newRow, newCol) {
  const { boardSize, players, walls } = gameState;
  const p1 = players['1'];
  const p2 = players['2'];
  const currentP = players[player];
  const opponentP = players[player === 1 ? '2' : '1'];

  const rowDiff = Math.abs(newRow - currentP.row);
  const colDiff = Math.abs(newCol - currentP.col);
  const isOneStep = (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);

  if (isOneStep) {
    if (isWallBlocking(currentP.row, currentP.col, newRow, newCol, walls)) {
      return { isValid: false, message: "カベがあって進めないよ。" };
    }
    return { isValid: true };
  }

  const isAdjacent = (Math.abs(p1.row - p2.row) + Math.abs(p1.col - p2.col)) === 1;
  if (!isAdjacent) {
    return { isValid: false, message: "そこには動かせないみたい。" };
  }

  const jumpRow = opponentP.row + (opponentP.row - currentP.row);
  const jumpCol = opponentP.col + (opponentP.col - currentP.col);
  if (newRow === jumpRow && newCol === jumpCol) {
    if (isWallBlocking(currentP.row, currentP.col, opponentP.row, opponentP.col, walls)) {
      return { isValid: false, message: "ジャンプできないよ。" };
    }
    if (isWallBlocking(opponentP.row, opponentP.col, newRow, newCol, walls)) {
      return { isValid: false, message: "ジャンプした先にカベがあるよ。" };
    }
    return { isValid: true };
  }

  const behindOpponentRow = opponentP.row + (opponentP.row - currentP.row);
  const behindOpponentCol = opponentP.col + (opponentP.col - currentP.col);
  const isWallBehindOpponent = isWallBlocking(opponentP.row, opponentP.col, behindOpponentRow, behindOpponentCol, walls) ||
                              behindOpponentRow < 0 || behindOpponentRow >= boardSize ||
                              behindOpponentCol < 0 || behindOpponentCol >= boardSize;

  if (isWallBehindOpponent) {
      if (isWallBlocking(currentP.row, currentP.col, opponentP.row, opponentP.col, walls)) {
          return { isValid: false, message: "そこには動かせないみたい。"};
      }
      const diagRowDiff = Math.abs(newRow - opponentP.row);
      const diagColDiff = Math.abs(newCol - opponentP.col);
      if((diagRowDiff === 1 && diagColDiff === 0) || (diagRowDiff === 0 && diagColDiff === 1)) {
          if (isWallBlocking(opponentP.row, opponentP.col, newRow, newCol, walls)){
              return { isValid: false, message: "カベがあって進めないよ。" };
          }
          return {isValid: true};
      }
  }

  return { isValid: false, message: "そこには動かせないみたい。" };
}

function validateWallPlacement(gameState, player, row, col, orientation) {
  const { players, walls } = gameState;

  if (players[player].walls <= 0) {
    return { isValid: false, message: "もうカベは置けないよ。" };
  }

  for (const wall of walls) {
    if (wall.row === row && wall.col === col && wall.orientation === orientation) {
      return { isValid: false, message: "そこにはもうカベがあるよ。" };
    }
    if (wall.row === row && wall.col === col) {
      return { isValid: false, message: "カベをクロスさせちゃダメだよ。" };
    }
    if (orientation === 'horizontal' && wall.orientation === 'horizontal' && wall.row === row && Math.abs(wall.col - col) === 1) {
      return { isValid: false, message: "カベをくっつけて置けないよ。" };
    }
    if (orientation === 'vertical' && wall.orientation === 'vertical' && wall.col === col && Math.abs(wall.row - row) === 1) {
      return { isValid: false, message: "カベをくっつけて置けないよ。" };
    }
  }

  const tempWalls = [...walls, { row, col, orientation }];
  const p1_can_reach = pathExists(players['1'], players['1'].goalCol, gameState.boardSize, tempWalls);
  const p2_can_reach = pathExists(players['2'], players['2'].goalCol, gameState.boardSize, tempWalls);

  if (!p1_can_reach || !p2_can_reach) {
    return { isValid: false, message: "ゴールの道をふさいじゃダメ！" };
  }

  return { isValid: true };
}

function checkWinCondition(gameState, player) {
  const { players } = gameState;
  const currentP = players[player];
  return currentP.col === currentP.goalCol;
}

//================================================================
// 4. ヘルパー関数
//================================================================

function isWallBlocking(r1, c1, r2, c2, walls) {
  for (const wall of walls) {
    if (wall.orientation === 'horizontal') {
      if (r1 !== r2) {
        if (wall.row === Math.min(r1, r2) && (wall.col === c1 || wall.col === c1 - 1)) {
          return true;
        }
      }
    } else { // vertical
      if (c1 !== c2) {
        if (wall.col === Math.min(c1, c2) && (wall.row === r1 || wall.row === r1 - 1)) {
          return true;
        }
      }
    }
  }
  return false;
}

function pathExists(player, goalCol, boardSize, walls) {
  const queue = [{ row: player.row, col: player.col }];
  const visited = new Set([`${player.row},${player.col}`]);
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const { row, col } = queue.shift();
    if (col === goalCol) {
      return true;
    }
    for (const [dr, dc] of directions) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const key = `${nextRow},${nextCol}`;
      if (nextRow < 0 || nextRow >= boardSize || nextCol < 0 || nextCol >= boardSize) continue;
      if (visited.has(key)) continue;
      if (isWallBlocking(row, col, nextRow, nextCol, walls)) continue;
      visited.add(key);
      queue.push({ row: nextRow, col: nextCol });
    }
  }
  return false;
}
