
"use client"

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, User, Play, LogIn, Trophy, Timer as TimerIcon, Hash, CheckCircle2, XCircle, ArrowRight, Settings, LogOut, ShieldCheck, ShieldAlert, Rocket, Globe } from 'lucide-react';
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
    if (gameSession && status !== 'MENU' && status !== 'PROFILE') {
      if (gameSession.status !== status) {
        setStatus(gameSession.status);
        
        if (gameSession.status === 'VALIDATING' && gameSession.validationMode === 'AI') {
          runAIValidation();
        }
        
        if (gameSession.status === 'PLAYING') {
          setGameTimer(60);
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

  // Guest Join Logic
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
    if (selectedMode === 'GUEST') {
      setStatus('JOIN_ROOM');
    } else {
      setStatus('PROFILE');
    }
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
      } else if (mode === 'GUEST') {
        setStatus('LOBBY');
      }
    }
  };

  const handleJoinCode = () => {
    if (inputCode.length !== 4) {
      toast({ title: "Invalid Code", description: "Please enter a 4-digit code." });
      return;
    }
    setRoomCode(inputCode);
    setStatus('PROFILE'); // Guests set their profile AFTER entering a code
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

  const handleStop = () => {
    const activeValidationMode = gameSession?.validationMode || validationMode;
    const nextStatus = activeValidationMode === 'AI' ? 'VALIDATING' : 'MANUAL_VALIDATION';
    
    if ((mode === 'SINGLE' || mode === 'HOST') && gameSessionRef) {
      updateDocumentNonBlocking(gameSessionRef, { status: nextStatus });
    }
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

    if (gameSessionRef && (mode === 'HOST' || mode === 'SINGLE')) {
      updateDocumentNonBlocking(gameSessionRef, { status: 'ROUND_RESULT' });
    }
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

      if (gameSessionRef && (mode === 'HOST' || mode === 'SINGLE')) {
        setTimeout(() => {
          updateDocumentNonBlocking(gameSessionRef, { status: 'ROUND_RESULT' });
        }, 3000);
      }
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
                <Badge variant="outline" className="text-accent font-bold">Score: {profile.score}</Badge>
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
            <CardTitle className="text-2xl font-bold">Profile Setup</CardTitle>
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

            <Button className="w-full h-14 text-xl font-bold bg-accent hover:bg-accent/90 rounded-2xl" onClick={finalizeProfile}>
              Let's Play <ArrowRight className="ml-2 w-6 h-6" />
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
              {gameSession?.players.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-4 bg-muted/50 rounded-2xl border-l-4 border-primary shadow-sm">
                  <span className="text-3xl">{p.avatar}</span>
                  <span className="font-bold text-lg flex-1">{p.nickname} {p.id === user?.uid ? '(You)' : ''}</span>
                  {p.isHost && <Badge className="bg-primary px-3">Host</Badge>}
                </div>
              ))}
            </div>
            
            {mode !== 'GUEST' ? (
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
            {['Name', 'Place', 'Animal', 'Thing'].map(cat => (
              <div key={cat} className="space-y-2 group">
                <label className="text-sm font-black uppercase tracking-widest ml-1 text-primary/80">{cat}</label>
                <Input 
                  placeholder={`Type a ${cat}...`}
                  className="h-16 text-2xl font-bold px-6 rounded-2xl shadow-md border-2 group-focus-within:border-accent transition-all bg-card"
                  autoFocus={cat === 'Name'}
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
          <CardDescription className="text-xl font-medium">Analyzing your answers against the rules...</CardDescription>
        </Card>
      )}

      {status === 'MANUAL_VALIDATION' && (
        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl bg-card rounded-3xl overflow-hidden">
          <CardHeader className="text-center bg-primary/10 py-6">
            <CardTitle className="text-2xl font-black">Manual Review</CardTitle>
            <CardDescription className="font-bold">Letter: "{gameSession?.currentLetter}"</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {['name', 'place', 'animal', 'thing'].map(cat => (
              <div key={cat} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border-2 transition-all hover:bg-muted/50">
                <div>
                  <p className="text-xs uppercase font-black text-primary/60 tracking-widest">{cat}</p>
                  <p className="text-xl font-black">{localAnswers[cat as keyof RoundAnswers] || '—'}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="icon" 
                    variant={manualValidation[cat] ? 'default' : 'outline'}
                    className={`rounded-xl h-12 w-12 ${manualValidation[cat] ? 'bg-green-500 hover:bg-green-600 shadow-md' : ''}`}
                    onClick={() => setManualValidation({...manualValidation, [cat]: true})}
                  >
                    <ShieldCheck className="w-6 h-6" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant={!manualValidation[cat] ? 'destructive' : 'outline'}
                    className={`rounded-xl h-12 w-12 ${!manualValidation[cat] ? 'shadow-md' : ''}`}
                    onClick={() => setManualValidation({...manualValidation, [cat]: false})}
                  >
                    <ShieldAlert className="w-6 h-6" />
                  </Button>
                </div>
              </div>
            ))}
            
            {mode !== 'GUEST' ? (
              <Button className="w-full h-14 mt-6 bg-primary rounded-2xl font-black text-xl shadow-lg" onClick={finalizeManualValidation}>
                Confirm Scores
              </Button>
            ) : (
              <div className="mt-4 p-4 text-center bg-muted/30 rounded-xl border border-dashed animate-pulse">
                <p className="text-muted-foreground font-black">Waiting for Host to validate...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status === 'ROUND_RESULT' && (
        <div className="w-full max-w-3xl space-y-6 overflow-y-auto max-h-[90vh] pb-8 animate-in zoom-in duration-300">
          <Card className="bg-card border-2 border-primary/10 overflow-hidden shadow-2xl rounded-3xl">
            <CardHeader className="bg-primary text-primary-foreground p-8">
              <div className="flex justify-between items-center">
                <div>
                   <p className="text-xs uppercase font-black tracking-widest opacity-80 mb-1">Results</p>
                   <CardTitle className="text-4xl font-black">Round Summary</CardTitle>
                </div>
                <div className="flex items-center gap-3 bg-white/20 px-6 py-3 rounded-2xl backdrop-blur-md">
                  <Trophy className="w-8 h-8 text-accent" />
                  <span className="font-black text-2xl">+{profile?.lastRoundScore || 0}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
               <div className="flex items-center justify-between mb-10 pb-6 border-b">
                  <div className="flex items-center gap-6">
                    <span className="text-7xl drop-shadow-lg">{profile?.avatar}</span>
                    <div>
                      <h4 className="text-3xl font-black text-primary">{profile?.nickname}</h4>
                      <p className="text-muted-foreground font-bold">Total Score: {profile?.score} pts</p>
                    </div>
                  </div>
                  <Badge className="text-2xl py-3 px-8 bg-accent text-white font-black rounded-2xl shadow-lg border-b-4 border-black/20">
                    {profile?.lastRoundScore || 0} PTS
                  </Badge>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {['name', 'place', 'animal', 'thing'].map(cat => {
                    const isValid = gameSession?.validationMode === 'AI' ? true : manualValidation[cat]; 
                    return (
                      <div key={cat} className="p-6 rounded-3xl bg-muted/20 border-2 border-primary/5 flex items-center justify-between shadow-sm transition-all hover:scale-[1.02]">
                         <div>
                            <p className="text-xs uppercase font-black text-primary/50 tracking-widest mb-2">{cat}</p>
                            <p className="text-2xl font-black">{localAnswers[cat as keyof RoundAnswers] || '—'}</p>
                         </div>
                         {isValid ? (
                           <div className="bg-green-100 p-3 rounded-2xl border border-green-200 shadow-inner">
                              <CheckCircle2 className="w-10 h-10 text-green-600" />
                           </div>
                         ) : (
                           <div className="bg-destructive/10 p-3 rounded-2xl border border-destructive/20 shadow-inner">
                              <XCircle className="w-10 h-10 text-destructive" />
                           </div>
                         )}
                      </div>
                    );
                  })}
               </div>
            </CardContent>
          </Card>

          {mode !== 'GUEST' ? (
            <Button className="w-full h-16 text-2xl font-black bg-primary rounded-3xl shadow-xl border-b-8 border-black/10 active:border-b-0 active:translate-y-1 transition-all" onClick={initiateRound}>
              Next Round <Play className="ml-2 w-8 h-8" />
            </Button>
          ) : (
            <div className="p-4 bg-card/80 rounded-2xl text-center border-2 border-dashed border-primary/20 animate-pulse">
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
