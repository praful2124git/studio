
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Peer, DataConnection } from 'peerjs';
import { GameMessage, Player, GameMode } from '@/lib/game-types';

export function useMultiplayer(mode: GameMode, roomCode?: string) {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [peerId, setPeerId] = useState<string>('');
  const connectionsRef = useRef<DataConnection[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initPeer = async () => {
      const { Peer } = await import('peerjs');
      const id = mode === 'HOST' ? `npat-game-${roomCode}` : undefined;
      const newPeer = new Peer(id as string);

      newPeer.on('open', (id) => {
        setPeerId(id);
      });

      newPeer.on('connection', (conn) => {
        conn.on('open', () => {
          setConnections((prev) => [...prev, conn]);
          connectionsRef.current.push(conn);
        });

        conn.on('data', (data) => {
          setMessages((prev) => [...prev, data as GameMessage]);
        });
      });

      setPeer(newPeer);
    };

    initPeer();

    return () => {
      peer?.destroy();
    };
  }, [mode, roomCode]);

  const connectToHost = useCallback((hostId: string) => {
    if (!peer) return;
    const conn = peer.connect(`npat-game-${hostId}`);
    conn.on('open', () => {
      setConnections([conn]);
      connectionsRef.current = [conn];
    });
    conn.on('data', (data) => {
      setMessages((prev) => [...prev, data as GameMessage]);
    });
  }, [peer]);

  const broadcast = useCallback((message: GameMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }, []);

  const sendToHost = useCallback((message: GameMessage) => {
    if (connectionsRef.current[0]?.open) {
      connectionsRef.current[0].send(message);
    }
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    peer,
    peerId,
    connections,
    messages,
    connectToHost,
    broadcast,
    sendToHost,
    clearMessages,
  };
}
