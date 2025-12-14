import React from 'react'
import { DollarSign, Home, CreditCard, Wallet, Smartphone, TrendingUp, Briefcase, Star, Lock } from 'lucide-react'

export function PiggyBankIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2.5V5z" />
      <path d="M2 9v1c0 1.1.9 2 2 2h1" />
      <path d="M16 11h.01" />
    </svg>
  )
}

export const ACCOUNT_ICONS = [
  { id: 'cash', icon: <DollarSign size={20} />, name: 'เงินสด' },
  { id: 'bank', icon: <Home size={20} />, name: 'ธนาคาร' },
  { id: 'card', icon: <CreditCard size={20} />, name: 'บัตรเครดิต' },
  { id: 'saving', icon: <PiggyBankIcon size={20} />, name: 'เงินออม' },
  { id: 'wallet', icon: <Wallet size={20} />, name: 'กระเป๋า' },
  { id: 'digital', icon: <Smartphone size={20} />, name: 'E-Wallet' },
  { id: 'invest', icon: <TrendingUp size={20} />, name: 'พอร์ตหุ้น' },
  { id: 'gold', icon: <Star size={20} />, name: 'ทองคำ' },
  { id: 'business', icon: <Briefcase size={20} />, name: 'ธุรกิจ' },
  { id: 'safe', icon: <Lock size={20} />, name: 'ตู้เซฟ' },
]

export const ACCOUNT_COLORS = [
  '#1DD1A1', '#54A0FF', '#FF6B6B', '#FF9F43', '#5F27CD', '#485460',
  '#00d2d3', '#2e86de', '#ee5253', '#feca57', '#341f97', '#222f3e',
]

export const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#FF9F43', '#54A0FF',
  '#5F27CD', '#C8D6E5', '#1DD1A1', '#F368E0', '#485460',
]

export const EMOJI_PRESETS = [
  '🍜','🍛','🍱','🍔','🍕','🍞','🥩','🍗','🍟','🍦','🍰','☕','🥤',
  '🚗','🚕','🚌','🚇','🚂','🏍️','🚲','✈️','⛽','🛍️','👗','👕','👟',
  '📱','💻','⌚','🏠','💡','💧','🌐','📞','🔧','🧹','🛏️','🪴',
  '💊','🏥','🦷','👓','🏋️','🧘','⚽','🏊','🎬','🎵','🎮','📚','🏖️',
  '🎓','✏️','💼','📅','📝','👶','🐶','🐱','💰','🎁','📈','💳','💸',
  '🎉','💐','💌','🔒','🔑','📦'
]
