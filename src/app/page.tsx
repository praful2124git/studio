
"use client"

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, User, Play, LogIn, Trophy, Timer as TimerIcon, 
  CheckCircle2, XCircle, ArrowRight, Settings, LogOut, 
  ShieldCheck, ShieldAlert, Rocket, Globe, Copy 
} from 'lucide-react';
import { GameStatus, Player, GameMode, GameState, RoundAnswers, Submission } from '@/lib/game-types';
import { validateAnswers } from '@/ai/flows/ai-answer-validation-flow';
import { 
  useUser, useFirestore, useDoc, useMemoFirebase, useCollection,
  setDocumentNonBlocking, updateDocumentNonBlocking, initiateAnonymousSignIn 
} from '@/firebase';
import { doc, collection, query, where, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const AVATARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
const CATEGORIES = ['Name', 'Place', 'Animal', 'Thing'];

export default function Home() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const auth = useAuth();
  
  const [status, setStatus] = useState<GameStatus>('MENU');
  const [mode, setMode] = useState<GameMode | null>(null);
  const [isMultiplayerMenu, setIsMultiplayerMenu] = useState(false);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [validationMode, setValidationMode] = useState<'AI' | 'HUMAN'>('AI');
  
  const [localAnswers, setLocalAnswers] = useState<RoundAnswers>({
    name: '',
    place: '',
    animal: '',
    thing: '',
  });

  const [hostValidation, setHostValidation] = useState<{ [playerId: string]: { [category: string]: 'correct' | 'duplicate' | 'wrong' } }>({});

  // Firestore Data Hooks
  const playerProfileRef = useMemoFirebase(() => user ? doc(db, 'player_profiles', user.uid) : null, [db, user]);
  const { data: profile } = useDoc<Player>(playerProfileRef);

  const gameSessionRef = useMemoFirebase(() => (user && roomCode) ? doc(db, 'game_sessions', roomCode) : null, [db, user, roomCode]);
  const { data: gameSession } = useDoc<GameState>(gameSessionRef);

  // Submissions listener - for validation phase
  const submissionsRef = useMemoFirebase(() => {
    if (!roomCode || !gameSession || !user) return null;
    return query(
      collection(db, 'game_sessions', roomCode, 'submissions'),
      where('roundCount', '==', gameSession.roundCount)
    );
  }, [db, roomCode, gameSession?.roundCount, user]);
  
  const { data: submissions } = useCollection<Submission>(submissionsRef);

  // Initial load of profile info if it exists
  useEffect(() => {
    if (profile && !nickname) {
      setNickname(profile.nickname || '');
      setAvatar(profile.avatar || AVATARS[0]);
    }
  }, [profile]);

  const submitLocalAnswers = useCallback(() => {
    if (!user || !roomCode || !gameSession) return;
    
    const subRef = doc(db, 'game_sessions', roomCode, 'submissions', user.uid);
    setDocumentNonBlocking(subRef, {
      id: user.uid,
      playerId: user.uid,
      nickname: nickname,
      avatar: avatar,
      answers: localAnswers,
      roundCount: gameSession.roundCount,
      hostPlayerId: gameSession.hostPlayerId
    }, { merge: true });
  }, [user, roomCode, gameSession, nickname, avatar, localAnswers, db]);

  // Handle game state transitions and remote triggers
  useEffect(() => {
    if (gameSession && user) {
      if (gameSession.status !== status) {
        const oldStatus = status;
        setStatus(gameSession.status);
        
        // Auto-submit if the round ended by anyone
        if (oldStatus === 'PLAYING' && (gameSession.status === 'VALIDATING' || gameSession.status === 'MANUAL_VALIDATION')) {
          submitLocalAnswers();
        }

        if (gameSession.status === 'VALIDATING') {
          runAIValidation();
        }
        
        if (gameSession.status === 'PLAYING') {
          setGameTimer(60);
        }
      }
    }
  }, [gameSession, status, user, submitLocalAnswers]);

  // Sync session scores to global profile
  useEffect(() => {
    if (gameSession?.status === 'ROUND_RESULT' && user && gameSession.players) {
      const meInSession = gameSession.players.find(p => p.id === user.uid);
      if (meInSession && profile && meInSession.score !== profile.score) {
        updateDocumentNonBlocking(doc(db, 'player_profiles', user.uid), {
          score: meInSession.score,
          lastRoundScore: meInSession.lastRoundScore
        });
      }
    }
  }, [gameSession?.status, gameSession?.players, user, profile, db]);

  useEffect(() => {
    if (gameSession?.status === 'COUNTDOWN') {
      setLocalAnswers({ name: '', place: '', animal: '', thing: '' });
      setHostValidation({});
      setGameTimer(60);
    }
  }, [gameSession?.status]);

  const handleSignIn = () => {
    initiateAnonymousSignIn(auth);
  };

  const startNewGame = (selectedMode: GameMode) => {
    setMode(selectedMode);
    if (!user) {
      handleSignIn();
    }
    if (selectedMode === 'GUEST') {
      setStatus('JOIN_ROOM');
    } else {
      setStatus('PROFILE');
    }
  };

  const handleJoinCode = async () => {
    if (inputCode.length !== 4) {
      toast({ title: "Invalid Code", description: "Please enter a 4-digit code." });
      return;
    }
    
    // Check if session exists
    const sessionDoc = await getDoc(doc(db, 'game_sessions', inputCode));
    if (!sessionDoc.exists()) {
      toast({ title: "Room Not Found", description: "This room code doesn't exist.", variant: "destructive" });
      return;
    }

    setRoomCode(inputCode);
    setStatus('PROFILE');
  };

  const finalizeProfile = () => {
    if (!nickname.trim()) {
      toast({ title: "Nickname required", description: "Who are you?" });
      return;
    }

    if (user) {
      const pData: Player = {
        id: user.uid,
        nickname,
        avatar,
        isHost: mode === 'HOST' || mode === 'SINGLE',
        score: profile?.score || 0,
      };
      
      // Update global profile
      setDocumentNonBlocking(doc(db, 'player_profiles', user.uid), pData, { merge: true });

      if (mode === 'HOST' || mode === 'SINGLE') {
        const code = mode === 'SINGLE' ? `SOLO-${user.uid.substring(0, 4)}` : Math.floor(1000 + Math.random() * 9000).toString();
        setRoomCode(code);
        
        const initialSession: GameState = {
          players: [pData],
          status: 'LOBBY',
          currentLetter: '',
          timer: 60,
          roomCode: code,
          roundCount: 0,
          validationMode: validationMode,
          hostPlayerId: user.uid,
          members: { [user.uid]: true }
        };
        
        setDocumentNonBlocking(doc(db, 'game_sessions', code), initialSession, { merge: true });
        setStatus('LOBBY');
      } else if (mode === 'GUEST') {
        // Join existing session in lobby
        if (gameSessionRef) {
          const updatedMembers = { ...(gameSession?.members || {}), [user.uid]: true };
          const updatedPlayers = [...(gameSession?.players || [])];
          
          if (!updatedPlayers.find(p => p.id === user.uid)) {
            updatedPlayers.push(pData);
          }

          updateDocumentNonBlocking(gameSessionRef, {
            members: updatedMembers,
            players: updatedPlayers
          });
        }
        setStatus('LOBBY');
      }
    }
  };

  const initiateRound = () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const letter = letters[Math.floor(Math.random() * letters.length)];
    
    if (gameSessionRef) {
      updateDocumentNonBlocking(gameSessionRef, {
        currentLetter: letter,
        status: 'COUNTDOWN',
        timer: 60,
        roundCount: (gameSession?.roundCount || 0) + 1,
      });
    }
    setCountdown(3);
    setStatus('COUNTDOWN');
  };

  const toggleValidationMode = () => {
    const nextMode = (gameSession?.validationMode || validationMode) === 'AI' ? 'HUMAN' : 'AI';
    setValidationMode(nextMode);
    if (gameSessionRef) {
      updateDocumentNonBlocking(gameSessionRef, { validationMode: nextMode });
    }
  };

  const [countdown, setCountdown] = useState(3);
  useEffect(() => {
    if (status === 'COUNTDOWN') {
      if (countdown > 0) {
        const t = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(t);
      } else {
        if ((mode === 'SINGLE' || mode === 'HOST') && gameSessionRef) {
          updateDocumentNonBlocking(gameSessionRef, { status: 'PLAYING' });
        }
        setStatus('PLAYING');
        setCountdown(3);
      }
    }
  }, [status, countdown, mode, gameSessionRef]);

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

  const handleStop = () => {
    if (!user || !roomCode || !gameSession) return;
    submitLocalAnswers();

    const activeValidationMode = gameSession?.validationMode || validationMode;
    const nextStatus = activeValidationMode === 'AI' ? 'VALIDATING' : 'MANUAL_VALIDATION';
    
    if (gameSessionRef) {
      updateDocumentNonBlocking(gameSessionRef, { status: nextStatus });
    }
  };

  const finalizeManualValidation = () => {
    if (!gameSession || !submissions) return;

    const updatedPlayers = gameSession.players.map(p => {
      let roundScore = 0;
      const playerVals = hostValidation[p.id] || {};
      
      CATEGORIES.forEach(cat => {
        const valStatus = playerVals[cat.toLowerCase()];
        if (valStatus === 'correct') roundScore += 10;
        if (valStatus === 'duplicate') roundScore += 5;
      });

      return {
        ...p,
        score: (p.score || 0) + roundScore,
        lastRoundScore: roundScore
      };
    });

    if (gameSessionRef) {
      updateDocumentNonBlocking(gameSessionRef, { 
        status: 'ROUND_RESULT',
        players: updatedPlayers
      });
    }
  };

  const runAIValidation = async () => {
    if (!gameSession || !user) return;
    
    const letter = gameSession.currentLetter;
    try {
      const result = await validateAnswers({
        targetLetter: letter,
        name: localAnswers.name,
        place: localAnswers.place,
        animal: localAnswers.animal,
        thing: localAnswers.thing
      });

      let roundScore = 0;
      CATEGORIES.forEach(cat => {
        const valKey = `${cat.toLowerCase()}Validation` as keyof typeof result;
        const val = result[valKey] as any;
        if (val?.isValid) roundScore += 10;
      });

      const updatedTotalScore = (profile?.score || 0) + roundScore;
      
      updateDocumentNonBlocking(doc(db, 'player_profiles', user.uid), {
        score: updatedTotalScore,
        lastRoundScore: roundScore
      });
      
      // If host, finalize after a delay for others to finish
      if (gameSessionRef && (mode === 'HOST' || mode === 'SINGLE')) {
        setTimeout(() => {
          // Note: In real production we'd collect all scores, for MVP host's AI results finalize the session
          const latestPlayers = gameSession.players.map(p => {
            if (p.id === user.uid) return { ...p, score: updatedTotalScore, lastRoundScore: roundScore };
            return p;
          });
          updateDocumentNonBlocking(gameSessionRef, { 
            status: 'ROUND_RESULT',
            players: latestPlayers
          });
        }, 3000);
      }
    } catch (e) {
      toast({ title: "Validation Error", description: "AI judge failed. Using manual fallback.", variant: "destructive" });
      if (gameSessionRef && (mode === 'HOST' || mode === 'SINGLE')) {
        updateDocumentNonBlocking(gameSessionRef, { status: 'MANUAL_VALIDATION' });
      }
    }
  };

  if (isUserLoading) return <div className="min-h-screen flex items-center justify-center">Loading LetterLink...</div>;

  const sortedPlayers = gameSession?.players ? [...gameSession.players].sort((a, b) => b.score - a.score) : [];

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center font-body text-foreground">
      {status === 'MENU' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card/80 backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="flex justify-between items-start">
              <div className="w-10" />
              <div className="p-4 bg-primary/10 rounded-3xl animate-float">
                <Rocket className="w-12 h-12 text-accent" />
              </div>
              {user && (
                <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="text-muted-foreground">
                  <LogOut className="w-5 h-5" />
                </Button>
              )}
            </div>
            <CardTitle className="text-4xl font-bold tracking-tight text-primary">LetterLink Live</CardTitle>
            <CardDescription className="text-lg">Real-time multiplayer word game</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isMultiplayerMenu ? (
              <>
                <Button className="w-full h-16 text-xl font-semibold gap-3 bg-primary hover:bg-primary/90 rounded-2xl" onClick={() => startNewGame('SINGLE')}>
                  <User className="w-6 h-6" /> Solo Mode
                </Button>
                <Button variant="outline" className="w-full h-16 text-xl font-semibold gap-3 border-2 hover:bg-accent/10 rounded-2xl" onClick={() => setIsMultiplayerMenu(true)}>
                  <Globe className="w-6 h-6" /> Multiplayer Mode
                </Button>
              </>
            ) : (
              <div className="space-y-4 animate-in slide-in-from-right duration-300">
                <p className="text-center font-bold text-muted-foreground uppercase text-xs tracking-widest">Select Multiplayer Action</p>
                <div className="grid grid-cols-2 gap-4">
                  <Button className="h-20 text-lg font-bold flex-col gap-1 bg-primary rounded-2xl" onClick={() => startNewGame('HOST')}>
                    <Users className="w-6 h-6" /> Host Room
                  </Button>
                  <Button className="h-20 text-lg font-bold flex-col gap-1 bg-accent rounded-2xl" onClick={() => startNewGame('GUEST')}>
                    <LogIn className="w-6 h-6" /> Join Room
                  </Button>
                </div>
                <Button variant="ghost" className="w-full h-12" onClick={() => setIsMultiplayerMenu(false)}>Back to Main Menu</Button>
              </div>
            )}
            
            {profile && (
              <div className="pt-4 border-t flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{profile.avatar}</span>
                  <span className="font-bold">{profile.nickname}</span>
                </div>
                <Badge variant="outline" className="text-accent font-bold">All-time: {profile.score}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status === 'JOIN_ROOM' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Join Game</CardTitle>
            <CardDescription>Enter the 4-digit room code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              placeholder="0000" 
              className="h-20 text-center text-5xl tracking-[0.5em] font-bold border-2 rounded-2xl bg-muted/20" 
              maxLength={4}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
            />
            <Button className="w-full h-14 text-xl font-bold bg-accent hover:bg-accent/90 rounded-2xl shadow-lg" onClick={handleJoinCode}>
              Find Room
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => { setStatus('MENU'); setIsMultiplayerMenu(false); }}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {status === 'PROFILE' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Who are you today?</CardTitle>
            <CardDescription>Pick an avatar and a nickname</CardDescription>
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
              placeholder="Enter Nickname" 
              className="h-14 text-center text-xl rounded-2xl font-semibold border-2" 
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            
            <Button className="w-full h-14 text-xl font-bold bg-accent hover:bg-accent/90 rounded-2xl" onClick={finalizeProfile}>
              Enter Game <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'LOBBY' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card">
          <CardHeader className="text-center flex flex-row items-center justify-between border-b pb-4 mb-4">
            <div>
              <CardTitle className="text-2xl font-bold">Lobby</CardTitle>
              <CardDescription className="flex items-center gap-2">
                Room Code: <span className="text-primary font-black text-xl tracking-widest">{roomCode}</span>
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-lg py-1 px-3 border-accent text-accent animate-pulse">Waiting...</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Players Joined</p>
              {gameSession?.players?.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-4 bg-muted/50 rounded-2xl border-l-4 border-primary shadow-sm">
                  <span className="text-3xl">{p.avatar}</span>
                  <span className="font-bold text-lg flex-1">{p.nickname} {p.id === user?.uid ? '(You)' : ''}</span>
                  {p.isHost && <Badge className="bg-primary px-3">Host</Badge>}
                </div>
              ))}
            </div>

            {gameSession?.hostPlayerId === user?.uid && (
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-primary/10">
                 <div className="flex items-center gap-2">
                   <Settings className="w-5 h-5 text-muted-foreground" />
                   <span className="font-medium text-sm">Judge Mode</span>
                 </div>
                 <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant={(gameSession?.validationMode || validationMode) === 'AI' ? 'default' : 'outline'} 
                      onClick={() => toggleValidationMode()}
                      className="rounded-full px-4"
                    >AI</Button>
                    <Button 
                      size="sm" 
                      variant={(gameSession?.validationMode || validationMode) === 'HUMAN' ? 'default' : 'outline'} 
                      onClick={() => toggleValidationMode()}
                      className="rounded-full px-4"
                    >Manual</Button>
                 </div>
              </div>
            )}
            
            {gameSession?.hostPlayerId === user?.uid ? (
              <Button className="w-full h-14 text-xl font-bold bg-primary hover:bg-primary/90 rounded-2xl shadow-xl" onClick={initiateRound}>
                Start Game <Play className="ml-2 w-6 h-6" />
              </Button>
            ) : (
              <div className="p-4 bg-muted/30 rounded-2xl text-center border border-dashed border-primary/20">
                <p className="animate-pulse text-muted-foreground font-bold">Waiting for Host to start...</p>
              </div>
            )}
            <Button variant="ghost" className="w-full h-12" onClick={() => { setRoomCode(''); setStatus('MENU'); setIsMultiplayerMenu(false); }}>Leave Session</Button>
          </CardContent>
        </Card>
      )}

      {status === 'COUNTDOWN' && (
        <div className="text-[12rem] font-black text-accent animate-bounce drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]">
          {countdown > 0 ? countdown : 'GO!'}
        </div>
      )}

      {status === 'PLAYING' && (
        <div className="w-full max-w-2xl space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center bg-card/50 backdrop-blur-sm p-6 rounded-3xl border-2 border-primary/10 shadow-2xl">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-accent text-white flex items-center justify-center text-6xl font-black rounded-3xl shadow-xl border-4 border-white/20">
                {gameSession?.currentLetter || '—'}
              </div>
              <div>
                <h3 className="text-3xl font-black text-primary">Round {gameSession?.roundCount || 1}</h3>
                <p className="text-muted-foreground font-medium">Starts with "{gameSession?.currentLetter || '—'}"</p>
              </div>
            </div>
            <div className={`flex flex-col items-center justify-center bg-background/50 px-6 py-3 rounded-2xl border ${gameTimer < 10 ? 'border-destructive text-destructive animate-pulse' : 'border-primary/20 text-primary'}`}>
              <div className="flex items-center gap-2 text-4xl font-black">
                <TimerIcon className="w-8 h-8" />
                {gameTimer}s
              </div>
              <span className="text-xs font-bold uppercase tracking-widest opacity-70">Remaining</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {CATEGORIES.map(cat => (
              <div key={cat} className="space-y-2 group">
                <label className="text-sm font-black uppercase tracking-widest ml-1 text-primary/80">{cat}</label>
                <Input 
                  placeholder={`Type a ${cat}...`}
                  className="h-16 text-2xl font-bold px-6 rounded-2xl shadow-md border-2 group-focus-within:border-accent transition-all bg-card"
                  value={localAnswers[cat.toLowerCase() as keyof RoundAnswers]}
                  onChange={(e) => setLocalAnswers({...localAnswers, [cat.toLowerCase()]: e.target.value})}
                />
              </div>
            ))}
          </div>

          <Button className="w-full h-20 text-3xl font-black bg-destructive hover:bg-destructive/90 rounded-3xl shadow-2xl mt-6 border-b-8 border-black/20 active:border-b-0 active:translate-y-2 transition-all" onClick={handleStop}>
            STOP!
          </Button>
        </div>
      )}

      {status === 'VALIDATING' && (
        <Card className="w-full max-w-md p-10 text-center bg-card border-2 border-primary/10 shadow-2xl rounded-3xl">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 border-8 border-primary border-t-accent rounded-full animate-spin"></div>
          </div>
          <CardTitle className="text-3xl font-black mb-3">AI Judge at Work</CardTitle>
          <CardDescription className="text-xl font-medium">Analyzing everyone's answers...</CardDescription>
        </Card>
      )}

      {status === 'MANUAL_VALIDATION' && (
        <Card className="w-full max-w-4xl border-2 border-primary/20 shadow-2xl bg-card rounded-3xl overflow-hidden">
          <CardHeader className="text-center bg-primary/10 py-6">
            <CardTitle className="text-2xl font-black">Manual Validation</CardTitle>
            <CardDescription className="font-bold">Letter: "{gameSession?.currentLetter}"</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {gameSession?.hostPlayerId === user?.uid ? (
              <div className="space-y-6">
                <Carousel className="w-full">
                  <CarouselContent>
                    {CATEGORIES.map(cat => (
                      <CarouselItem key={cat}>
                        <div className="p-4 bg-muted/20 rounded-3xl border-2 border-primary/10">
                          <h3 className="text-2xl font-black text-primary text-center mb-6 uppercase tracking-widest">{cat}</h3>
                          <div className="space-y-3">
                            {submissions?.map(sub => {
                              const answer = sub.answers[cat.toLowerCase() as keyof RoundAnswers];
                              const currentVal = hostValidation[sub.playerId]?.[cat.toLowerCase()];
                              
                              return (
                                <div key={sub.id} className="flex items-center justify-between p-4 bg-card rounded-2xl border shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <span className="text-2xl">{sub.avatar}</span>
                                    <div>
                                      <p className="text-xs font-bold text-muted-foreground">{sub.nickname}</p>
                                      <p className="text-xl font-black">{answer || '—'}</p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button 
                                      size="icon" 
                                      variant={currentVal === 'correct' ? 'default' : 'outline'}
                                      className={`rounded-xl h-10 w-10 ${currentVal === 'correct' ? 'bg-green-500' : ''}`}
                                      onClick={() => setHostValidation(prev => ({
                                        ...prev,
                                        [sub.playerId]: { ...prev[sub.playerId], [cat.toLowerCase()]: 'correct' }
                                      }))}
                                    >
                                      <ShieldCheck className="w-5 h-5" />
                                    </Button>
                                    <Button 
                                      size="icon" 
                                      variant={currentVal === 'duplicate' ? 'default' : 'outline'}
                                      className={`rounded-xl h-10 w-10 ${currentVal === 'duplicate' ? 'bg-accent' : ''}`}
                                      onClick={() => setHostValidation(prev => ({
                                        ...prev,
                                        [sub.playerId]: { ...prev[sub.playerId], [cat.toLowerCase()]: 'duplicate' }
                                      }))}
                                    >
                                      <Copy className="w-5 h-5" />
                                    </Button>
                                    <Button 
                                      size="icon" 
                                      variant={currentVal === 'wrong' ? 'destructive' : 'outline'}
                                      className="rounded-xl h-10 w-10"
                                      onClick={() => setHostValidation(prev => ({
                                        ...prev,
                                        [sub.playerId]: { ...prev[sub.playerId], [cat.toLowerCase()]: 'wrong' }
                                      }))}
                                    >
                                      <ShieldAlert className="w-5 h-5" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <div className="flex justify-center gap-4 mt-6">
                    <CarouselPrevious className="relative translate-y-0" />
                    <CarouselNext className="relative translate-y-0" />
                  </div>
                </Carousel>
                
                <Button className="w-full h-16 bg-primary rounded-2xl font-black text-xl shadow-lg mt-6" onClick={finalizeManualValidation}>
                  Finalize Scores
                </Button>
              </div>
            ) : (
              <div className="py-20 text-center animate-pulse">
                <ShieldCheck className="w-16 h-16 text-primary mx-auto mb-4" />
                <p className="text-2xl font-black text-primary">Host is validating answers...</p>
                <p className="text-muted-foreground">Relax, scores are coming soon!</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status === 'ROUND_RESULT' && (
        <div className="w-full max-w-4xl space-y-6 overflow-y-auto max-h-[90vh] pb-8 animate-in zoom-in duration-300">
          <Card className="bg-card border-2 border-primary/10 overflow-hidden shadow-2xl rounded-3xl">
            <CardHeader className="bg-primary text-primary-foreground p-8">
              <div className="flex justify-between items-center">
                <div>
                   <p className="text-xs uppercase font-black tracking-widest opacity-80 mb-1">Standings</p>
                   <CardTitle className="text-4xl font-black">Scoreboard</CardTitle>
                </div>
                <Trophy className="w-12 h-12 text-accent" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
               <div className="divide-y">
                  {sortedPlayers.map((p, index) => (
                    <div key={p.id} className={`flex items-center justify-between p-6 transition-all ${p.id === user?.uid ? 'bg-primary/5' : ''}`}>
                      <div className="flex items-center gap-6">
                        <span className="text-3xl font-black text-muted-foreground w-8">#{index + 1}</span>
                        <span className="text-5xl drop-shadow-md">{p.avatar}</span>
                        <div>
                          <h4 className="text-2xl font-black text-primary flex items-center gap-2">
                            {p.nickname}
                            {p.id === user?.uid && <Badge variant="outline" className="text-[10px] uppercase">You</Badge>}
                          </h4>
                          <p className="text-muted-foreground font-bold">Round Gain: +{p.lastRoundScore || 0} pts</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-black text-primary">{p.score} pts</p>
                        <p className="text-xs font-black uppercase text-accent tracking-tighter">Total Score</p>
                      </div>
                    </div>
                  ))}
               </div>
            </CardContent>
          </Card>

          {gameSession?.hostPlayerId === user?.uid ? (
            <Button className="w-full h-16 text-2xl font-black bg-primary rounded-3xl shadow-xl border-b-8 border-black/10 active:border-b-0 active:translate-y-1 transition-all" onClick={initiateRound}>
              Start Next Round <Play className="ml-2 w-8 h-8" />
            </Button>
          ) : (
            <div className="p-6 bg-card/80 rounded-2xl text-center border-2 border-dashed border-primary/20 animate-pulse">
              <p className="font-black text-primary uppercase tracking-widest">Waiting for Host to start next round...</p>
            </div>
          )}
          <Button variant="outline" className="w-full h-14 text-lg font-bold rounded-2xl border-2" onClick={() => { setRoomCode(''); setStatus('MENU'); setIsMultiplayerMenu(false); }}>
            Exit to Main Menu
          </Button>
        </div>
      )}
    </div>
  );
}
