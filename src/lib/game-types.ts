
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

export interface Player {
  id: string;
  nickname: string;
  avatar: string;
  isHost: boolean;
  score: number;
  lastRoundScore?: number;
  answers?: RoundAnswers;
  validation?: ValidationResults;
}

export interface RoundAnswers {
  name: string;
  place: string;
  animal: string;
  thing: string;
}

export interface ValidationResults {
  name: { isValid: boolean; reason: string };
  place: { isValid: boolean; reason: string };
  animal: { isValid: boolean; reason: string };
  thing: { isValid: boolean; reason: string };
}

export interface GameState {
  players: Player[];
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
