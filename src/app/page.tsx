
"use client"

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Users, User, Play, LogIn, Trophy, Timer as TimerIcon, Hash, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { GameStatus, Player, GameMode, GameState, RoundAnswers, ValidationResults } from '@/lib/game-types';
import { useMultiplayer } from '@/hooks/use-multiplayer';
import { validateAnswers } from '@/ai/flows/ai-answer-validation-flow';

const AVATARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];

export default function Home() {
  const { toast } = useToast();
  const [status, setStatus] = useState<GameStatus>('MENU');
  const [mode, setMode] = useState<GameMode>('SINGLE');
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    status: 'MENU',
    currentLetter: '',
    timer: 60,
    roundCount: 1,
    validationMode: 'AI',
  });

  const [localAnswers, setLocalAnswers] = useState<RoundAnswers>({
    name: '',
    place: '',
    animal: '',
    thing: '',
  });

  const { broadcast, sendToHost, messages, clearMessages, connectToHost, peerId } = useMultiplayer(mode, roomCode);

  const startNewGame = (selectedMode: GameMode) => {
    setMode(selectedMode);
    if (selectedMode === 'HOST') {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      setRoomCode(code);
    }
    setStatus('PROFILE');
  };

  const handleJoin = () => {
    if (inputCode.length !== 4) {
      toast({ title: "Invalid Code", description: "Please enter a 4-digit code." });
      return;
    }
    setRoomCode(inputCode);
    startNewGame('GUEST');
  };

  const finalizeProfile = () => {
    if (!nickname.trim()) {
      toast({ title: "Nickname required", description: "Who are you?" });
      return;
    }

    const me: Player = {
      id: mode === 'SINGLE' ? 'local' : '', // Will be updated when peer opens
      nickname,
      avatar,
      isHost: mode === 'HOST',
      score: 0,
    };

    if (mode === 'SINGLE') {
      setGameState(prev => ({ ...prev, players: [me] }));
      setStatus('LOBBY');
    } else if (mode === 'HOST') {
      setGameState(prev => ({ ...prev, players: [{ ...me, id: peerId }] }));
      setStatus('LOBBY');
    } else {
      connectToHost(roomCode);
      setStatus('LOBBY');
    }
  };

  useEffect(() => {
    if (peerId && mode === 'HOST' && status === 'LOBBY') {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.isHost ? { ...p, id: peerId } : p)
      }));
    }
  }, [peerId, mode, status]);

  useEffect(() => {
    if (messages.length > 0) {
      const msg = messages[0];
      switch (msg.type) {
        case 'JOIN_REQUEST':
          if (mode === 'HOST') {
            const newPlayer: Player = { ...msg.payload, isHost: false, score: 0 };
            setGameState(prev => {
              const updated = { ...prev, players: [...prev.players, newPlayer] };
              broadcast({ type: 'PLAYER_LIST', payload: updated.players });
              return updated;
            });
          }
          break;
        case 'PLAYER_LIST':
          if (mode === 'GUEST') {
            setGameState(prev => ({ ...prev, players: msg.payload }));
          }
          break;
        case 'START_ROUND':
          setGameState(prev => ({ ...prev, ...msg.payload }));
          setStatus('COUNTDOWN');
          break;
        case 'SUBMIT_ANSWERS':
          if (mode === 'HOST') {
            setGameState(prev => ({
              ...prev,
              players: prev.players.map(p => p.id === msg.payload.playerId ? { ...p, answers: msg.payload.answers } : p)
            }));
          }
          break;
        case 'SYNC_RESULTS':
          setGameState(prev => ({ ...prev, players: msg.payload, status: 'ROUND_RESULT' }));
          setStatus('ROUND_RESULT');
          break;
        case 'HOST_STOP':
          handleStop();
          break;
      }
      clearMessages();
    }
  }, [messages, mode, broadcast, clearMessages]);

  useEffect(() => {
    if (mode === 'GUEST' && peerId && status === 'LOBBY' && gameState.players.length === 0) {
      sendToHost({
        type: 'JOIN_REQUEST',
        payload: { id: peerId, nickname, avatar }
      });
    }
  }, [peerId, mode, status, nickname, avatar, sendToHost, gameState.players.length]);

  const initiateRound = () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const roundData = {
      currentLetter: letter,
      timer: 60,
      status: 'PLAYING' as GameStatus
    };
    
    if (mode === 'HOST') {
      broadcast({ type: 'START_ROUND', payload: roundData });
    }
    
    setGameState(prev => ({ ...prev, ...roundData }));
    setStatus('COUNTDOWN');
  };

  const [countdown, setCountdown] = useState(3);
  useEffect(() => {
    if (status === 'COUNTDOWN') {
      if (countdown > 0) {
        const t = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(t);
      } else {
        setStatus('PLAYING');
        setCountdown(3);
      }
    }
  }, [status, countdown]);

  const [gameTimer, setGameTimer] = useState(60);
  useEffect(() => {
    if (status === 'PLAYING') {
      if (gameTimer > 0) {
        const t = setTimeout(() => setGameTimer(gameTimer - 1), 1000);
        return () => clearTimeout(t);
      } else {
        handleStop();
      }
    }
  }, [status, gameTimer]);

  const handleStop = async () => {
    setStatus('VALIDATING');
    if (mode === 'GUEST') {
      sendToHost({
        type: 'SUBMIT_ANSWERS',
        payload: { playerId: peerId, answers: localAnswers }
      });
    } else {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.isHost ? { ...p, answers: localAnswers } : p)
      }));
    }
  };

  const runAIValidation = async () => {
    if (mode !== 'HOST' && mode !== 'SINGLE') return;

    const updatedPlayers = [...gameState.players];
    const letter = gameState.currentLetter;

    for (let i = 0; i < updatedPlayers.length; i++) {
      const p = updatedPlayers[i];
      const ans = p.answers || { name: '', place: '', animal: '', thing: '' };
      
      try {
        const result = await validateAnswers({
          targetLetter: letter,
          name: ans.name,
          place: ans.place,
          animal: ans.animal,
          thing: ans.thing
        });
        updatedPlayers[i].validation = {
          name: result.nameValidation,
          place: result.placeValidation,
          animal: result.animalValidation,
          thing: result.thingValidation,
        };
      } catch (e) {
        // Local heuristic fallback
        updatedPlayers[i].validation = {
          name: { isValid: ans.name.toLowerCase().startsWith(letter.toLowerCase()) && ans.name.length > 1, reason: "Fallback validation" },
          place: { isValid: ans.place.toLowerCase().startsWith(letter.toLowerCase()) && ans.place.length > 1, reason: "Fallback validation" },
          animal: { isValid: ans.animal.toLowerCase().startsWith(letter.toLowerCase()) && ans.animal.length > 1, reason: "Fallback validation" },
          thing: { isValid: ans.thing.toLowerCase().startsWith(letter.toLowerCase()) && ans.thing.length > 1, reason: "Fallback validation" },
        };
      }
    }

    // Scoring logic
    updatedPlayers.forEach((p, idx) => {
      let roundScore = 0;
      const cats: (keyof RoundAnswers)[] = ['name', 'place', 'animal', 'thing'];
      cats.forEach(cat => {
        const val = p.validation?.[cat];
        if (val?.isValid) {
          const isDuplicate = updatedPlayers.some((other, oIdx) => 
            oIdx !== idx && 
            other.answers?.[cat]?.toLowerCase().trim() === p.answers?.[cat]?.toLowerCase().trim()
          );
          roundScore += isDuplicate ? 5 : 10;
        }
      });
      p.lastRoundScore = roundScore;
      p.score += roundScore;
    });

    setGameState(prev => {
      const newState = { ...prev, players: updatedPlayers, status: 'ROUND_RESULT' as GameStatus };
      if (mode === 'HOST') broadcast({ type: 'SYNC_RESULTS', payload: updatedPlayers });
      return newState;
    });
    setStatus('ROUND_RESULT');
  };

  useEffect(() => {
    if (status === 'VALIDATING' && (mode === 'HOST' || mode === 'SINGLE')) {
      const allReady = gameState.players.every(p => !!p.answers);
      if (allReady) {
        runAIValidation();
      }
    }
  }, [status, gameState.players, mode]);

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center font-body text-foreground">
      {status === 'MENU' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card/80 backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-primary/10 rounded-3xl animate-float">
                <Hash className="w-12 h-12 text-accent" />
              </div>
            </div>
            <CardTitle className="text-4xl font-bold tracking-tight text-primary">LetterLink Live</CardTitle>
            <CardDescription className="text-lg">Name, Place, Animal, Thing - Reinvented</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full h-14 text-xl font-semibold gap-3 bg-primary hover:bg-primary/90 rounded-2xl" onClick={() => startNewGame('SINGLE')}>
              <User className="w-6 h-6" /> Solo Mode
            </Button>
            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-14 text-lg font-semibold gap-2 border-2 hover:bg-accent/10 rounded-2xl" onClick={() => startNewGame('HOST')}>
                <Users className="w-5 h-5" /> Host
              </Button>
              <div className="flex gap-2">
                <Input 
                  placeholder="Code" 
                  className="h-14 text-center text-xl tracking-[0.5em] font-bold border-2 rounded-2xl" 
                  maxLength={4}
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                />
                <Button variant="outline" className="h-14 aspect-square border-2 hover:bg-accent/10 rounded-2xl p-0" onClick={handleJoin}>
                  <LogIn className="w-6 h-6" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {status === 'PROFILE' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Your Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap justify-center gap-3">
              {AVATARS.map(a => (
                <button 
                  key={a} 
                  className={`text-3xl p-3 rounded-2xl transition-all ${avatar === a ? 'bg-accent scale-110 shadow-lg' : 'bg-muted hover:bg-primary/20'}`}
                  onClick={() => setAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            <Input 
              placeholder="Your Nickname" 
              className="h-12 text-center text-lg rounded-xl" 
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <Button className="w-full h-12 text-lg font-bold bg-accent hover:bg-accent/90 rounded-xl" onClick={finalizeProfile}>
              Ready to Play <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'LOBBY' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card">
          <CardHeader className="text-center flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">Lobby</CardTitle>
              {mode !== 'SINGLE' && <CardDescription>Room: {roomCode}</CardDescription>}
            </div>
            {mode !== 'SINGLE' && <Badge variant="outline" className="text-lg py-1 px-3 border-accent text-accent">{gameState.players.length} Players</Badge>}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              {gameState.players.map(p => (
                <div key={p.id || 'me'} className="flex items-center gap-3 p-3 bg-muted/50 rounded-2xl">
                  <span className="text-2xl">{p.avatar}</span>
                  <span className="font-semibold text-lg flex-1">{p.nickname}</span>
                  {p.isHost && <Badge className="bg-primary">Host</Badge>}
                </div>
              ))}
            </div>
            
            {(mode === 'HOST' || mode === 'SINGLE') ? (
              <Button className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 rounded-xl" onClick={initiateRound}>
                Start Game <Play className="ml-2 w-5 h-5" />
              </Button>
            ) : (
              <div className="text-center animate-pulse text-muted-foreground font-medium">Waiting for Host to start...</div>
            )}
          </CardContent>
        </Card>
      )}

      {status === 'COUNTDOWN' && (
        <div className="text-9xl font-bold text-accent animate-bounce drop-shadow-2xl">
          {countdown > 0 ? countdown : 'GO!'}
        </div>
      )}

      {status === 'PLAYING' && (
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex justify-between items-center bg-card/50 backdrop-blur-sm p-4 rounded-3xl border-2 border-primary/10 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-accent text-white flex items-center justify-center text-5xl font-bold rounded-2xl shadow-lg">
                {gameState.currentLetter}
              </div>
              <div>
                <h3 className="text-2xl font-bold">Round {gameState.roundCount}</h3>
                <p className="text-muted-foreground">Starting with "{gameState.currentLetter}"</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 text-3xl font-bold ${gameTimer < 10 ? 'text-destructive animate-pulse' : 'text-primary'}`}>
              <TimerIcon className="w-8 h-8" />
              {gameTimer}s
            </div>
          </div>

          <div className="grid gap-6">
            {['Name', 'Place', 'Animal', 'Thing'].map(cat => (
              <div key={cat} className="space-y-2">
                <label className="text-lg font-semibold ml-2">{cat}</label>
                <Input 
                  placeholder={`Write a ${cat}...`}
                  className="h-16 text-2xl font-medium px-6 rounded-2xl shadow-sm border-2 focus:border-accent"
                  autoFocus={cat === 'Name'}
                  value={localAnswers[cat.toLowerCase() as keyof RoundAnswers]}
                  onChange={(e) => setLocalAnswers({...localAnswers, [cat.toLowerCase()]: e.target.value})}
                />
              </div>
            ))}
          </div>

          <Button className="w-full h-16 text-2xl font-bold bg-accent hover:bg-accent/90 rounded-2xl shadow-xl mt-4" onClick={handleStop}>
            STOP!
          </Button>
        </div>
      )}

      {status === 'VALIDATING' && (
        <Card className="w-full max-w-md p-8 text-center bg-card border-2 border-primary/10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 border-4 border-primary border-t-accent rounded-full animate-spin"></div>
          </div>
          <CardTitle className="text-2xl mb-2">Analyzing Answers</CardTitle>
          <CardDescription className="text-lg">Our AI judge is checking your words...</CardDescription>
        </Card>
      )}

      {status === 'ROUND_RESULT' && (
        <div className="w-full max-w-3xl space-y-6 overflow-y-auto max-h-[90vh] pb-8">
          <Card className="bg-card border-2 border-primary/10 overflow-hidden shadow-2xl">
            <CardHeader className="bg-primary text-primary-foreground">
              <div className="flex justify-between items-center">
                <CardTitle className="text-3xl">Round Results</CardTitle>
                <div className="flex items-center gap-2 bg-white/20 px-4 py-1 rounded-full">
                  <Trophy className="w-5 h-5 text-accent" />
                  <span className="font-bold">Scores updated</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {gameState.players.map(p => (
                  <div key={p.id} className="p-6 space-y-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl">{p.avatar}</span>
                        <div>
                          <h4 className="text-xl font-bold">{p.nickname}</h4>
                          <p className="text-sm text-muted-foreground">Total: {p.score} pts</p>
                        </div>
                      </div>
                      <Badge className="text-xl py-1 px-4 bg-accent text-white">+{p.lastRoundScore} pts</Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {(['name', 'place', 'animal', 'thing'] as (keyof RoundAnswers)[]).map(cat => {
                        const val = p.validation?.[cat];
                        return (
                          <div key={cat} className={`p-3 rounded-xl border-2 flex flex-col ${val?.isValid ? 'border-green-500/20 bg-green-500/5' : 'border-destructive/20 bg-destructive/5'}`}>
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-xs uppercase font-bold text-muted-foreground">{cat}</span>
                              {val?.isValid ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                            </div>
                            <span className="text-lg font-bold truncate">{p.answers?.[cat] || '—'}</span>
                            <p className="text-[10px] leading-tight text-muted-foreground mt-1">{val?.reason}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {(mode === 'HOST' || mode === 'SINGLE') && (
            <Button className="w-full h-14 text-xl font-bold bg-primary rounded-2xl shadow-xl" onClick={() => {
              setLocalAnswers({ name: '', place: '', animal: '', thing: '' });
              setGameTimer(60);
              initiateRound();
            }}>
              Next Round <Play className="ml-2 w-6 h-6" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
