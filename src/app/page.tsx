
"use client"

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, User, Play, LogIn, Trophy, Timer as TimerIcon, Hash, CheckCircle2, XCircle, ArrowRight, Settings, LogOut, ShieldCheck, ShieldAlert } from 'lucide-react';
import { GameStatus, Player, GameMode, GameState, RoundAnswers } from '@/lib/game-types';
import { validateAnswers } from '@/ai/flows/ai-answer-validation-flow';
import { useUser, useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking, initiateAnonymousSignIn } from '@/firebase';
import { doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';

const AVATARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];

export default function Home() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const auth = useAuth();
  
  const [status, setStatus] = useState<GameStatus>('MENU');
  const [mode, setMode] = useState<GameMode>('SINGLE');
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

  const [manualValidation, setManualValidation] = useState<{ [key: string]: boolean }>({
    name: true,
    place: true,
    animal: true,
    thing: true,
  });

  // Firestore Data Hooks
  const playerProfileRef = useMemoFirebase(() => user ? doc(db, 'player_profiles', user.uid) : null, [db, user]);
  const { data: profile } = useDoc<Player>(playerProfileRef);

  const gameSessionRef = useMemoFirebase(() => (user && roomCode) ? doc(db, 'game_sessions', roomCode) : null, [db, user, roomCode]);
  const { data: gameSession } = useDoc<GameState>(gameSessionRef);

  // Sync profile locally if it exists
  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || '');
      setAvatar(profile.avatar || AVATARS[0]);
    }
  }, [profile]);

  // Handle room joining and game status synchronization
  useEffect(() => {
    if (gameSession) {
      if (status !== 'MENU' && status !== 'PROFILE') {
        if (gameSession.status !== status) {
          setStatus(gameSession.status);
          if (gameSession.status === 'PLAYING') {
             setGameTimer(60);
          }
        }
      }
    }
  }, [gameSession, status]);

  // Handle automatic answer clearing for new rounds
  useEffect(() => {
    if (gameSession?.status === 'COUNTDOWN') {
      setLocalAnswers({ name: '', place: '', animal: '', thing: '' });
      setManualValidation({ name: true, place: true, animal: true, thing: true });
      setGameTimer(60);
    }
  }, [gameSession?.status]);

  // Guest Join Logic: Add guest to members map and players array in Firestore
  useEffect(() => {
    if (gameSession && mode === 'GUEST' && user && profile && !gameSession.members[user.uid]) {
      const updatedMembers = { ...gameSession.members, [user.uid]: true };
      const guestPlayer: Player = {
        id: user.uid,
        nickname: profile.nickname,
        avatar: profile.avatar,
        isHost: false,
        score: profile.score || 0
      };
      
      const updatedPlayers = [...gameSession.players];
      if (!updatedPlayers.find(p => p.id === user.uid)) {
        updatedPlayers.push(guestPlayer);
      }
      
      updateDocumentNonBlocking(doc(db, 'game_sessions', roomCode), {
        members: updatedMembers,
        players: updatedPlayers
      });
    }
  }, [gameSession, mode, user, profile, roomCode, db]);

  const handleSignIn = () => {
    initiateAnonymousSignIn(auth);
  };

  const startNewGame = (selectedMode: GameMode) => {
    setMode(selectedMode);
    if (!user) {
      handleSignIn();
    }
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
      setDocumentNonBlocking(doc(db, 'player_profiles', user.uid), pData, { merge: true });

      if (mode === 'HOST' || mode === 'SINGLE') {
        const code = mode === 'SINGLE' 
          ? 'SOLO-' + user.uid.substring(0, 4)
          : Math.floor(1000 + Math.random() * 9000).toString();
        
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
      } else {
        setStatus('JOIN_ROOM');
      }
    }
  };

  const handleJoin = () => {
    if (inputCode.length !== 4) {
      toast({ title: "Invalid Code", description: "Please enter a 4-digit code." });
      return;
    }
    setRoomCode(inputCode);
    setStatus('LOBBY');
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

  const handleStop = async () => {
    const activeValidationMode = gameSession?.validationMode || validationMode;
    const nextStatus = activeValidationMode === 'AI' ? 'VALIDATING' : 'MANUAL_VALIDATION';
    
    if ((mode === 'SINGLE' || mode === 'HOST') && gameSessionRef) {
      updateDocumentNonBlocking(gameSessionRef, { status: nextStatus });
      if (activeValidationMode === 'AI') {
        runAIValidation();
      }
    }
    setStatus(nextStatus);
  };

  const finalizeManualValidation = () => {
    let roundScore = 0;
    const cats: (keyof RoundAnswers)[] = ['name', 'place', 'animal', 'thing'];
    cats.forEach(cat => {
      if (manualValidation[cat]) roundScore += 10;
    });

    const updatedScore = (profile?.score || 0) + roundScore;
    
    if (user) {
      updateDocumentNonBlocking(doc(db, 'player_profiles', user.uid), {
        score: updatedScore,
        lastRoundScore: roundScore
      });
    }

    if (gameSessionRef) {
      updateDocumentNonBlocking(gameSessionRef, {
        status: 'ROUND_RESULT'
      });
    }
    setStatus('ROUND_RESULT');
  };

  const runAIValidation = async () => {
    if (!gameSession) return;
    
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
      const cats: (keyof RoundAnswers)[] = ['name', 'place', 'animal', 'thing'];
      cats.forEach(cat => {
        const valKey = `${cat}Validation` as keyof typeof result;
        const val = result[valKey] as any;
        if (val?.isValid) roundScore += 10;
      });

      const updatedScore = (profile?.score || 0) + roundScore;
      
      if (user) {
        updateDocumentNonBlocking(doc(db, 'player_profiles', user.uid), {
          score: updatedScore,
          lastRoundScore: roundScore
        });
      }

      if (gameSessionRef) {
        updateDocumentNonBlocking(gameSessionRef, {
          status: 'ROUND_RESULT'
        });
      }
      setStatus('ROUND_RESULT');
    } catch (e) {
      toast({ title: "Validation Error", description: "AI judge failed. Using manual fallback.", variant: "destructive" });
      setStatus('MANUAL_VALIDATION');
    }
  };

  if (isUserLoading) return <div className="min-h-screen flex items-center justify-center">Loading LetterLink...</div>;

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center font-body text-foreground">
      {status === 'MENU' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card/80 backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="flex justify-between items-start">
              <div className="w-10" />
              <div className="p-4 bg-primary/10 rounded-3xl animate-float">
                <Hash className="w-12 h-12 text-accent" />
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
            <Button className="w-full h-14 text-xl font-semibold gap-3 bg-primary hover:bg-primary/90 rounded-2xl" onClick={() => startNewGame('SINGLE')}>
              <User className="w-6 h-6" /> Solo Mode
            </Button>
            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-14 text-lg font-semibold gap-2 border-2 hover:bg-accent/10 rounded-2xl" onClick={() => startNewGame('HOST')}>
                <Users className="w-5 h-5" /> Host
              </Button>
              <Button variant="outline" className="h-14 text-lg font-semibold gap-2 border-2 hover:bg-accent/10 rounded-2xl" onClick={() => startNewGame('GUEST')}>
                <LogIn className="w-5 h-5" /> Join
              </Button>
            </div>
            {profile && (
              <div className="pt-4 border-t flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{profile.avatar}</span>
                  <span className="font-bold">{profile.nickname}</span>
                </div>
                <Badge variant="outline" className="text-accent font-bold">Total: {profile.score} pts</Badge>
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
              className="h-14 text-center text-4xl tracking-[0.5em] font-bold border-2 rounded-2xl" 
              maxLength={4}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
            />
            <Button className="w-full h-12 text-lg font-bold bg-accent hover:bg-accent/90 rounded-xl" onClick={handleJoin}>
              Find Room
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStatus('MENU')}>Back</Button>
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
            
            {(mode === 'HOST' || mode === 'SINGLE') && (
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-primary/10">
                 <div className="flex items-center gap-2">
                   <Settings className="w-5 h-5 text-muted-foreground" />
                   <span className="font-medium text-sm">Validation Mode</span>
                 </div>
                 <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant={validationMode === 'AI' ? 'default' : 'outline'} 
                      onClick={() => setValidationMode('AI')}
                      className="rounded-full px-4"
                    >AI</Button>
                    <Button 
                      size="sm" 
                      variant={validationMode === 'HUMAN' ? 'default' : 'outline'} 
                      onClick={() => setValidationMode('HUMAN')}
                      className="rounded-full px-4"
                    >Manual</Button>
                 </div>
              </div>
            )}

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
              <CardDescription>Room: {roomCode}</CardDescription>
            </div>
            <Badge variant="outline" className="text-lg py-1 px-3 border-accent text-accent">Waiting...</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              {gameSession?.players.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-2xl border-l-4 border-primary">
                  <span className="text-2xl">{p.avatar}</span>
                  <span className="font-semibold text-lg flex-1">{p.nickname} {p.id === user?.uid ? '(You)' : ''}</span>
                  {p.isHost && <Badge className="bg-primary">Host</Badge>}
                </div>
              ))}
            </div>
            
            {mode !== 'GUEST' ? (
              <Button className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 rounded-xl" onClick={initiateRound}>
                Start Game <Play className="ml-2 w-5 h-5" />
              </Button>
            ) : (
              <div className="text-center animate-pulse text-muted-foreground font-medium">Waiting for Host to start...</div>
            )}
            <Button variant="ghost" className="w-full" onClick={() => { setRoomCode(''); setStatus('MENU'); }}>Leave</Button>
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
                {gameSession?.currentLetter || '—'}
              </div>
              <div>
                <h3 className="text-2xl font-bold">Round {gameSession?.roundCount || 1}</h3>
                <p className="text-muted-foreground">Starting with "{gameSession?.currentLetter || '—'}"</p>
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

      {status === 'MANUAL_VALIDATION' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Manual Validation</CardTitle>
            <CardDescription>Review answers for "{gameSession?.currentLetter}"</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {['name', 'place', 'animal', 'thing'].map(cat => (
              <div key={cat} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border">
                <div>
                  <p className="text-xs uppercase font-bold text-muted-foreground">{cat}</p>
                  <p className="text-xl font-bold">{localAnswers[cat as keyof RoundAnswers] || '—'}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="icon" 
                    variant={manualValidation[cat] ? 'default' : 'outline'}
                    className={manualValidation[cat] ? 'bg-green-500 hover:bg-green-600' : ''}
                    onClick={() => setManualValidation({...manualValidation, [cat]: true})}
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant={!manualValidation[cat] ? 'destructive' : 'outline'}
                    onClick={() => setManualValidation({...manualValidation, [cat]: false})}
                  >
                    <ShieldAlert className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            ))}
            
            {mode !== 'GUEST' ? (
              <Button className="w-full h-12 mt-4 bg-primary rounded-xl font-bold" onClick={finalizeManualValidation}>
                Confirm Scores
              </Button>
            ) : (
              <p className="text-center animate-pulse text-muted-foreground">Waiting for Host to validate...</p>
            )}
          </CardContent>
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
                  <span className="font-bold">Score Saved!</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <span className="text-5xl">{profile?.avatar}</span>
                    <div>
                      <h4 className="text-2xl font-bold">{profile?.nickname}</h4>
                      <p className="text-muted-foreground">Total Lifetime Score: {profile?.score} pts</p>
                    </div>
                  </div>
                  <Badge className="text-2xl py-2 px-6 bg-accent text-white animate-pulse">+{profile?.lastRoundScore || 0} pts</Badge>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['name', 'place', 'animal', 'thing'].map(cat => {
                    const isValid = gameSession?.validationMode === 'AI' ? true : manualValidation[cat]; 
                    return (
                      <div key={cat} className="p-4 rounded-2xl bg-muted/30 border-2 border-primary/5 flex items-center justify-between">
                         <div>
                            <p className="text-xs uppercase font-bold text-muted-foreground mb-1">{cat}</p>
                            <p className="text-xl font-bold">{localAnswers[cat as keyof RoundAnswers] || '—'}</p>
                         </div>
                         {isValid ? (
                           <CheckCircle2 className="w-8 h-8 text-green-500" />
                         ) : (
                           <XCircle className="w-8 h-8 text-destructive" />
                         )}
                      </div>
                    );
                  })}
               </div>
            </CardContent>
          </Card>

          {mode !== 'GUEST' && (
            <Button className="w-full h-14 text-xl font-bold bg-primary rounded-2xl shadow-xl" onClick={initiateRound}>
              Next Round <Play className="ml-2 w-6 h-6" />
            </Button>
          )}
          <Button variant="outline" className="w-full h-12" onClick={() => { setRoomCode(''); setStatus('MENU'); }}>Main Menu</Button>
        </div>
      )}
    </div>
  );
}
