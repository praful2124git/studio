
export type GameMode = 'SINGLE' | 'HOST' | 'GUEST';

export type GameStatus = 
  | 'MENU' 
  | 'PROFILE'
  | 'LOBBY' 
  | 'COUNTDOWN' 
  | 'PLAYING' 
  | 'VALIDATING' 
  | 'MANUAL_VALIDATION'
  | 'ROUND_RESULT' 
  | 'GAME_OVER';

export interface CategoryResult {
  isValid: boolean;
  reason: string;
  answer: string;
}

export interface Player {
  id: string;
  nickname: string;
  avatar: string;
  isHost: boolean;
  score: number;
  lastRoundScore?: number;
  lastRoundResults?: Record<string, CategoryResult>;
}

export interface RoundAnswers {
  name: string;
  place: string;
  animal: string;
  thing: string;
}

export interface Submission {
  id: string;
  playerId: string;
  nickname: string;
  avatar: string;
  answers: RoundAnswers;
  roundCount: number;
}

export interface GameState {
  status: GameStatus;
  currentLetter: string;
  timer: number;
  roomCode?: string;
  roundCount: number;
  validationMode: 'AI' | 'HUMAN';
  hostPlayerId: string;
  members: Record<string, boolean>;
}

export type MessageType = 
  | 'JOIN_REQUEST'
  | 'PLAYER_LIST'
  | 'START_ROUND'
  | 'SUBMIT_ANSWERS'
  | 'SYNC_RESULTS'
  | 'HOST_STOP';

export interface GameMessage {
  type: MessageType;
  payload: any;
}
