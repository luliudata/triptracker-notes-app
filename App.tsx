import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import ColorPicker, { Panel1, HueSlider, Preview } from 'reanimated-color-picker';
import EmojiPicker from 'rn-emoji-keyboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateItinerary, processVoiceAudio, isConfigured } from './services/gemini';

// --- Types ---
type Screen = 'trips' | 'home' | 'list' | 'add_item' | 'edit_item' | 'add_trip' | 'edit_trip' | 'add_category' | 'edit_flight' | 'edit_acc' | 'transport_list' | 'acc_list' | 'share' | 'notes' | 'expenses';
type Language = 'zh' | 'en';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Item {
  id: string;
  text: string;
  completed: boolean;
  link?: string;
  notes?: string;
}

const TRANSPORT_TYPES = [
  { emoji: '✈️', label: 'Flight' },
  { emoji: '🚂', label: 'Train' },
  { emoji: '🚌', label: 'Bus' },
  { emoji: '🚗', label: 'Car' },
  { emoji: '⛴️', label: 'Ferry' },
  { emoji: '🚇', label: 'Metro' },
  { emoji: '🚕', label: 'Taxi' },
  { emoji: '🚐', label: 'Shuttle' },
] as const;

interface TransportInfo {
  type: string;
  flightNumber: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
}

interface AccommodationInfo {
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
}

interface Expense {
  id: string;
  amount: number;
  description: string;
  currency: string;
}

interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  icon?: string;
  color?: string;
  categories: Category[];
  items: Record<string, Item[]>;
  transports?: TransportInfo[];
  accommodations?: AccommodationInfo[];
  archived?: boolean;
  notes?: string;
  expenses?: Expense[];
}

// --- Constants ---
const COLORS = [
  '#E67C73', '#F4511E', '#F6BF26', '#33B679', '#039BE5', '#7986CB', '#8E24AA',
];

const getBgStyle = (color?: string) => (color ? { backgroundColor: color } : {});

const getTripEmoji = (icon?: string): string => icon || '✈️';

type ItineraryBlock = { type: 'day' | 'bullet' | 'paragraph'; text: string };
const parseItineraryBlocks = (text: string): ItineraryBlock[] => {
  if (!text) return [];
  const blocks: ItineraryBlock[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(Day\s+\d+|第\s*\d+\s*天|##\s*Day|#\s*Day)/i.test(trimmed) || /^Day\s+\d+:/i.test(trimmed) || /^第\s*\d+\s*天\s*[：:]/i.test(trimmed)) {
      blocks.push({ type: 'day', text: trimmed.replace(/^#+\s*/, '') });
    } else if (/^[-•*●○]\s*/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-•*●○]\s*/, '') });
    } else {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
  }
  return blocks;
};

const DICT = {
  zh: {
    myTrips: '我的行程',
    addTrip: '新建行程',
    destination: '行程标题',
    startDate: '出发日期',
    endDate: '返程日期',
    save: '保存',
    cancel: '取消',
    daysLeft: '天后',
    daysAgo: '天前',
    ongoing: '进行中',
    checklists: '清单',
    addCategory: '添加分类',
    reorderCategories: '排序',
    reorderDone: '完成',
    categoryName: '分类名称',
    icon: '图标 (Emoji)',
    newItem: '新项目',
    addItem: '添加',
    noItems: '暂无项目',
    tapToAdd: '点击 + 添加',
    deleteCategory: '删除分类',
    back: '返回',
    upcoming: '即将出行',
    past: '历史行程',
    flight: '交通',
    accommodation: '住宿',
    addFlight: '添加',
    addFlightEmpty: '添加交通',
    addAcc: '添加',
    addAccEmpty: '添加住宿',
    flightNumber: '班次/航班号 (如: BA123)',
    fromPlace: '出发地',
    toPlace: '目的地',
    depTime: '出发时间',
    arrTime: '到达时间',
    hotelName: '住宿名称',
    address: '详细地址',
    checkIn: '入住日期',
    checkOut: '退房日期',
    shareTrip: '分享行程',
    selectToShare: '选择要分享的信息',
    copyText: '复制文本',
    copied: '已复制!',
    includeFlight: '包含交通信息',
    includeAcc: '包含住宿信息',
    archive: '归档',
    unarchive: '取消归档',
    archivedTrips: '已归档',
    deleteTrip: '删除行程',
    deleteTripConfirm: '确定永久删除此行程？所有清单、交通、住宿数据将一并删除，此操作不可撤销。',
    duplicate: '作为模板复制',
    sortByUpcoming: '按近期排序',
    sortManually: '手动排序',
    shareVia: '通过...分享',
    shareToWechat: '微信',
    wechatCopyPrompt: '已复制！打开微信粘贴即可分享。',
    notes: '备忘录',
    expenses: '记账',
    addExpense: '添加支出',
    amount: '金额',
    description: '描述',
    total: '总计',
    editTrip: '编辑行程',
    aiPlanner: 'AI 行程规划',
    generateItinerary: '生成智能行程',
    generatingItinerary: '正在为您规划行程...',
    shareItinerary: '分享行程',
    copyItinerary: '复制',
    saveToNotes: '保存到备忘录',
    copiedToClipboard: '已复制到剪贴板',
    savedToNotes: '行程已保存到备忘录，可在行程首页的「备忘录」卡片中查看和编辑',
    editItem: '编辑项目',
    link: '链接',
    notesLabel: '备忘录',
    linkPlaceholder: '淘宝/商品链接或网址',
    categoryNamePlaceholder: '在此输入，如：证件材料',
    addItemInlinePlaceholder: '添加一项（点右上角 + 可粘贴多条）',
    editItemNamePlaceholder: '项目名称',
    notesPlaceholder: '记录行程备忘...',
    destinationPlaceholder: '如：西安之行',
    addItemModalPlaceholder: '输入项目或粘贴多行列表...',
    dateTimePlaceholder: '选择日期和时间',
    dateOnlyPlaceholder: '选择日期',
    emptyTripsTitle: '开始规划你的旅程',
    emptyTripsSubtitle: '点击下方按钮创建第一个行程',
    emptyTripsHint1: '为每次旅行添加清单、交通和住宿信息',
    emptyTripsHint2: 'AI 可以根据你的信息自动规划行程',
    emptyTripsHint3: '支持分享行程为 PDF',
    defaultCategories: [
      { id: 'documents', name: '证件材料', icon: '📄', color: '#3F51B5' },
      { id: 'packing', name: '行李准备', icon: '🧳', color: '#039BE5' },
      { id: 'food', name: '想吃的店', icon: '🍜', color: '#F4511E' },
      { id: 'places', name: '想去的地方', icon: '📍', color: '#D50000' },
      { id: 'shopping', name: '购物清单', icon: '🛒', color: '#8E24AA' },
      { id: 'gifts', name: '伴手礼', icon: 'gift-outline', color: '#E67C73' },
      { id: 'errands', name: '待办事项', icon: 'checkbox-outline', color: '#33B679' },
    ],
  },
  en: {
    myTrips: 'My Trips',
    addTrip: 'New Trip',
    destination: 'Trip Title',
    startDate: 'Start Date',
    endDate: 'End Date',
    save: 'Save',
    cancel: 'Cancel',
    daysLeft: 'days left',
    daysAgo: 'days ago',
    ongoing: 'Ongoing',
    checklists: 'Checklists',
    addCategory: 'New Category',
    reorderCategories: 'Reorder',
    reorderDone: 'Done',
    categoryName: 'Category Name',
    icon: 'Icon (Emoji)',
    newItem: 'New Item',
    addItem: 'Add',
    noItems: 'No items yet',
    tapToAdd: 'Tap + to add',
    deleteCategory: 'Delete Category',
    back: 'Back',
    upcoming: 'Upcoming',
    past: 'Past Trips',
    flight: 'Transport',
    accommodation: 'Accommodation',
    addFlight: 'Add',
    addFlightEmpty: 'Add transport',
    addAcc: 'Add',
    addAccEmpty: 'Add accommodation',
    flightNumber: 'Transport No. (e.g. BA123)',
    fromPlace: 'From',
    toPlace: 'To',
    depTime: 'Departure',
    arrTime: 'Arrival',
    hotelName: 'Accommodation Name',
    address: 'Full Address',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    shareTrip: 'Share Trip',
    selectToShare: 'Select info to share',
    copyText: 'Copy Text',
    copied: 'Copied!',
    includeFlight: 'Include Transport',
    includeAcc: 'Include Accommodation',
    archive: 'Archive',
    deleteTrip: 'Delete Trip',
    deleteTripConfirm: 'Permanently delete this trip? All checklists, transport, and accommodation data will be lost. This cannot be undone.',
    unarchive: 'Unarchive',
    archivedTrips: 'Archived',
    duplicate: 'Use as Template',
    sortByUpcoming: 'Sort by Upcoming',
    sortManually: 'Sort Manually',
    shareVia: 'Share via...',
    shareToWechat: 'WeChat',
    wechatCopyPrompt: 'Copied! Open WeChat and paste to share.',
    notes: 'Notes',
    expenses: 'Expenses',
    addExpense: 'Add Expense',
    amount: 'Amount',
    description: 'Description',
    total: 'Total',
    editTrip: 'Edit Trip',
    aiPlanner: 'AI Planner',
    generateItinerary: 'Generate Itinerary',
    generatingItinerary: 'Planning your trip...',
    shareItinerary: 'Share',
    copyItinerary: 'Copy',
    saveToNotes: 'Save to Notes',
    copiedToClipboard: 'Copied to clipboard',
    savedToNotes: 'Saved! Scroll down to the Notes card on the trip home page to view or edit.',
    editItem: 'Edit item',
    link: 'Link',
    notesLabel: 'Notes',
    linkPlaceholder: 'Taobao / product URL or link',
    categoryNamePlaceholder: 'Type here, e.g. Documents',
    addItemInlinePlaceholder: 'Add an item (tap + to paste multiple)',
    editItemNamePlaceholder: 'Item name',
    notesPlaceholder: 'Trip notes...',
    destinationPlaceholder: 'e.g. Xi\'an trip',
    addItemModalPlaceholder: 'Type an item or paste a list...',
    dateTimePlaceholder: 'Pick a date & time',
    dateOnlyPlaceholder: 'Pick a date',
    emptyTripsTitle: 'Plan your next adventure',
    emptyTripsSubtitle: 'Tap the button below to create your first trip',
    emptyTripsHint1: 'Add checklists, transport & accommodation for each trip',
    emptyTripsHint2: 'AI can auto-generate an itinerary from your details',
    emptyTripsHint3: 'Share your trip as a PDF',
    defaultCategories: [
      { id: 'documents', name: 'Documents', icon: '📄', color: '#3F51B5' },
      { id: 'packing', name: 'Packing', icon: '🧳', color: '#039BE5' },
      { id: 'food', name: 'Places to Eat', icon: '🍜', color: '#F4511E' },
      { id: 'places', name: 'Places to Visit', icon: '📍', color: '#D50000' },
      { id: 'shopping', name: 'Shopping', icon: '🛒', color: '#8E24AA' },
      { id: 'gifts', name: 'Gifts', icon: 'gift-outline', color: '#E67C73' },
      { id: 'errands', name: 'Errands', icon: 'checkbox-outline', color: '#33B679' },
    ],
  },
};

const DEFAULT_CATEGORY_IDS = new Set(['documents', 'packing', 'transport', 'food', 'places', 'shopping', 'gifts', 'errands']);

const INITIAL_TRIPS: Trip[] = [];

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [screen, setScreen] = useState<Screen>('trips');
  const [trips, setTrips] = useState<Trip[]>(INITIAL_TRIPS);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const [newItemText, setNewItemText] = useState('');
  const [newTripData, setNewTripData] = useState({ destination: '', startDate: '', endDate: '', icon: '✈️', color: '#039BE5' });
  const [editTripData, setEditTripData] = useState({ destination: '', startDate: '', endDate: '', icon: '✈️', color: '#039BE5' });
  const [newCategoryData, setNewCategoryData] = useState({ name: '', icon: '✨' });
  const [editTransportData, setEditTransportData] = useState<TransportInfo>({ type: '✈️', flightNumber: '', from: '', to: '', departureTime: '', arrivalTime: '' });
  const [editTransportIndex, setEditTransportIndex] = useState(-1);
  const [editAccData, setEditAccData] = useState<AccommodationInfo>({ name: '', address: '', checkIn: '', checkOut: '' });
  const [editAccIndex, setEditAccIndex] = useState(-1);
  const [editNotesData, setEditNotesData] = useState('');
  const [newExpenseData, setNewExpenseData] = useState<Partial<Expense>>({ amount: 0, description: '', currency: '£' });
  const [shareSelection, setShareSelection] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [sortMode, setSortMode] = useState<'upcoming' | 'manual'>('upcoming');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [templateTripId, setTemplateTripId] = useState<string | null>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [openDatePicker, setOpenDatePicker] = useState<'start' | 'end' | 'dep' | 'arr' | 'checkIn' | 'checkOut' | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingColor, setPendingColor] = useState('#039BE5');
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const [editingItem, setEditingItem] = useState<{ id: string; text: string; link: string; notes: string } | null>(null);
  const [inlineItemText, setInlineItemText] = useState('');
  const [homeTab, setHomeTab] = useState<'lists' | 'ai_planner'>('lists');
  const [aiItinerary, setAiItinerary] = useState<string | null>(null);
  const [isGeneratingItinerary, setIsGeneratingItinerary] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isFirstRender = useRef(true);

  useEffect(() => {
    (async () => {
      try {
        const [savedTrips, savedLang, savedSort] = await Promise.all([
          AsyncStorage.getItem('suixing_trips'),
          AsyncStorage.getItem('suixing_lang'),
          AsyncStorage.getItem('suixing_sort'),
        ]);
        if (savedTrips) setTrips(JSON.parse(savedTrips));
        if (savedLang === 'en' || savedLang === 'zh') setLang(savedLang);
        if (savedSort === 'manual' || savedSort === 'upcoming') setSortMode(savedSort);
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        setDataLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!dataLoaded) return;
    AsyncStorage.setItem('suixing_trips', JSON.stringify(trips)).catch(console.error);
  }, [trips, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    AsyncStorage.setItem('suixing_lang', lang).catch(console.error);
  }, [lang, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    AsyncStorage.setItem('suixing_sort', sortMode).catch(console.error);
  }, [sortMode, dataLoaded]);

  const t = DICT[lang];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const saved = await AsyncStorage.getItem('suixing_trips');
      if (saved) setTrips(JSON.parse(saved));
    } catch (e) { console.error(e); }
    setRefreshing(false);
  }, []);

  const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];
  const applyDateValue = (field: 'start' | 'end' | 'dep' | 'arr' | 'checkIn' | 'checkOut', value: string) => {
    if (field === 'start') {
      screen === 'add_trip' ? setNewTripData({ ...newTripData, startDate: value }) : setEditTripData({ ...editTripData, startDate: value });
    } else if (field === 'end') {
      screen === 'add_trip' ? setNewTripData({ ...newTripData, endDate: value }) : setEditTripData({ ...editTripData, endDate: value });
    } else if (field === 'dep') {
      setEditTransportData(prev => ({ ...prev, departureTime: value }));
    } else if (field === 'arr') {
      setEditTransportData(prev => ({ ...prev, arrivalTime: value }));
    } else if (field === 'checkIn') {
      setEditAccData(prev => ({ ...prev, checkIn: value }));
    } else if (field === 'checkOut') {
      setEditAccData(prev => ({ ...prev, checkOut: value }));
    }
  };
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  };
  const parseDateSafe = (dateStr: string, fallbackDateStr?: string): Date => {
    if (dateStr) { const d = new Date(dateStr); if (!isNaN(d.getTime())) return d; }
    if (fallbackDateStr) { const d = new Date(fallbackDateStr); if (!isNaN(d.getTime())) return d; }
    return new Date();
  };
  const openTrip = (tripId: string) => {
    setActiveTripId(tripId);
    setAiItinerary(null);
    setHomeTab('lists');
    setScreen('home');
  };

  const activeTrip = trips.find((x) => x.id === activeTripId);
  const activeCategory = activeTrip?.categories.find((c) => c.id === activeCategoryId);

  const getCategoryDisplayName = (category: Category): string => {
    if (DEFAULT_CATEGORY_IDS.has(category.id)) {
      const match = t.defaultCategories.find((dc: Category) => dc.id === category.id);
      if (match) return match.name;
    }
    return category.name;
  };

  const getDaysDiff = (dateStr: string) => {
    if (!dateStr) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getTripStatus = (startDate: string, endDate: string) => {
    if (!startDate && !endDate) return { status: 'upcoming', text: lang === 'zh' ? '待规划' : 'Draft', badgeStyle: styles.statusUpcoming, textStyle: styles.statusTextUpcoming };
    const startDiff = getDaysDiff(startDate);
    const endDiff = getDaysDiff(endDate || startDate);
    if (startDiff > 0) return { status: 'upcoming', text: `${startDiff} ${t.daysLeft}`, badgeStyle: styles.statusUpcoming, textStyle: styles.statusTextUpcoming };
    if (endDiff >= 0) return { status: 'ongoing', text: t.ongoing, badgeStyle: styles.statusOngoing, textStyle: styles.statusTextOngoing };
    return { status: 'past', text: `${Math.abs(endDiff)} ${t.daysAgo}`, badgeStyle: styles.statusPast, textStyle: styles.statusTextPast };
  };

  const getTripDatesDisplay = (trip: Trip) => {
    if (!trip.startDate && !trip.endDate) return t.dateOnlyPlaceholder;
    return `${formatDateDisplay(trip.startDate)}${trip.endDate ? ` → ${formatDateDisplay(trip.endDate)}` : ''}`;
  };

  const getProgress = (trip: Trip, categoryId: string) => {
    const catItems = trip.items[categoryId] || [];
    if (catItems.length === 0) return 0;
    const completed = catItems.filter((i) => i.completed).length;
    return Math.round((completed / catItems.length) * 100);
  };

  const handleAddTrip = () => {
    if (!newTripData.destination) return;
    let categories = [...t.defaultCategories];
    let items: Record<string, Item[]> = {};
    if (templateTripId) {
      const template = trips.find((x) => x.id === templateTripId);
      if (template) {
        categories = JSON.parse(JSON.stringify(template.categories));
        Object.keys(template.items).forEach((catId) => {
          items[catId] = template.items[catId].map((item) => ({ ...item, id: Date.now().toString() + Math.random(), completed: false }));
        });
      }
    }
    const newTrip: Trip = {
      id: Date.now().toString(),
      ...newTripData,
      categories,
      items,
    };
    setTrips([newTrip, ...trips]);
    setNewTripData({ destination: '', startDate: '', endDate: '', icon: '✈️', color: '#039BE5' });
    setTemplateTripId(null);
    setScreen('trips');
  };

  const handleSaveTripInfo = () => {
    if (!activeTripId || !editTripData.destination) return;
    setTrips(trips.map((x) => (x.id === activeTripId ? { ...x, destination: editTripData.destination, startDate: editTripData.startDate, endDate: editTripData.endDate, icon: editTripData.icon, color: editTripData.color } : x)));
    setScreen('home');
  };

  const handleSaveTransport = () => {
    if (!activeTripId) return;
    setTrips(trips.map((x) => {
      if (x.id !== activeTripId) return x;
      const list = [...(x.transports || [])];
      if (editTransportIndex >= 0 && editTransportIndex < list.length) {
        list[editTransportIndex] = editTransportData;
      } else {
        list.push(editTransportData);
      }
      return { ...x, transports: list };
    }));
    setScreen('transport_list');
  };

  const handleDeleteTransport = (idx: number) => {
    if (!activeTripId) return;
    setTrips(trips.map((x) => {
      if (x.id !== activeTripId) return x;
      const list = [...(x.transports || [])];
      list.splice(idx, 1);
      return { ...x, transports: list.length ? list : undefined };
    }));
  };

  const handleSaveAcc = () => {
    if (!activeTripId) return;
    setTrips(trips.map((x) => {
      if (x.id !== activeTripId) return x;
      const list = [...(x.accommodations || [])];
      if (editAccIndex >= 0 && editAccIndex < list.length) {
        list[editAccIndex] = editAccData;
      } else {
        list.push(editAccData);
      }
      return { ...x, accommodations: list };
    }));
    setScreen('acc_list');
  };

  const handleDeleteAcc = (idx: number) => {
    if (!activeTripId) return;
    setTrips(trips.map((x) => {
      if (x.id !== activeTripId) return x;
      const list = [...(x.accommodations || [])];
      list.splice(idx, 1);
      return { ...x, accommodations: list.length ? list : undefined };
    }));
  };

  const handleSaveNotes = () => {
    if (!activeTripId) return;
    setTrips(trips.map((x) => (x.id === activeTripId ? { ...x, notes: editNotesData } : x)));
    setScreen('home');
  };

  const handleAddExpense = () => {
    if (!activeTripId || !newExpenseData.amount || !newExpenseData.description) return;
    const newExpense: Expense = {
      id: Date.now().toString(),
      amount: Number(newExpenseData.amount),
      description: newExpenseData.description,
      currency: newExpenseData.currency || '£',
    };
    setTrips(trips.map((x) => (x.id === activeTripId ? { ...x, expenses: [...(x.expenses || []), newExpense] } : x)));
    setNewExpenseData({ amount: 0, description: '', currency: newExpenseData.currency || '£' });
  };

  const handleDeleteExpense = (expenseId: string) => {
    if (!activeTripId) return;
    setTrips(trips.map((x) => (x.id === activeTripId ? { ...x, expenses: (x.expenses || []).filter((e) => e.id !== expenseId) } : x)));
  };

  const handleAddCategory = () => {
    if (!newCategoryData.name || !activeTripId) return;
    const newCat: Category = {
      id: Date.now().toString(),
      name: newCategoryData.name,
      icon: newCategoryData.icon || '✨',
      color: COLORS[activeTrip!.categories.length % COLORS.length],
    };
    setTrips(trips.map((trip) => (trip.id === activeTripId ? { ...trip, categories: [...trip.categories, newCat] } : trip)));
    setNewCategoryData({ name: '', icon: '✨' });
    setScreen('home');
  };

  const handleDeleteCategory = () => {
    if (!activeTripId || !activeCategoryId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const catName = activeCategory ? getCategoryDisplayName(activeCategory) : '';
    const itemCount = activeTrip?.items[activeCategoryId]?.length || 0;
    const message = lang === 'zh'
      ? `确定删除「${catName}」分类${itemCount > 0 ? `及其 ${itemCount} 个项目` : ''}？此操作不可撤销。`
      : `Delete "${catName}"${itemCount > 0 ? ` and its ${itemCount} item${itemCount > 1 ? 's' : ''}` : ''}? This cannot be undone.`;
    Alert.alert(
      lang === 'zh' ? '删除分类' : 'Delete Category',
      message,
      [
        { text: t.cancel, style: 'cancel' },
        { text: lang === 'zh' ? '删除' : 'Delete', style: 'destructive', onPress: () => {
          setTrips(trips.map((trip) => {
            if (trip.id !== activeTripId) return trip;
            const newItems = { ...trip.items };
            delete newItems[activeCategoryId];
            return { ...trip, categories: trip.categories.filter((c) => c.id !== activeCategoryId), items: newItems };
          }));
          setScreen('home');
        }},
      ]
    );
  };

  const handleToggleItem = (itemId: string) => {
    if (!activeTripId || !activeCategoryId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTrips(trips.map((trip) => {
      if (trip.id !== activeTripId) return trip;
      return {
        ...trip,
        items: {
          ...trip.items,
          [activeCategoryId]: trip.items[activeCategoryId].map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)),
        },
      };
    }));
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activeTripId || !activeCategoryId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTrips(trips.map((trip) => {
      if (trip.id !== activeTripId) return trip;
      return {
        ...trip,
        items: { ...trip.items, [activeCategoryId]: trip.items[activeCategoryId].filter((item) => item.id !== itemId) },
      };
    }));
  };

  const handleMoveItem = (itemId: string, direction: 'up' | 'down') => {
    if (!activeTripId || !activeCategoryId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTrips(trips.map((trip) => {
      if (trip.id !== activeTripId) return trip;
      const list = [...(trip.items[activeCategoryId] || [])];
      const idx = list.findIndex((i) => i.id === itemId);
      if (idx === -1) return trip;
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= list.length) return trip;
      [list[idx], list[swap]] = [list[swap], list[idx]];
      return { ...trip, items: { ...trip.items, [activeCategoryId]: list } };
    }));
  };

  const handleMoveItemToEdge = (itemId: string, toTop: boolean) => {
    if (!activeTripId || !activeCategoryId) return;
    setTrips(trips.map((trip) => {
      if (trip.id !== activeTripId) return trip;
      const list = [...(trip.items[activeCategoryId] || [])];
      const idx = list.findIndex((i) => i.id === itemId);
      if (idx === -1) return trip;
      const [item] = list.splice(idx, 1);
      if (toTop) list.unshift(item);
      else list.push(item);
      return { ...trip, items: { ...trip.items, [activeCategoryId]: list } };
    }));
  };

  const handleSaveItemEdit = () => {
    if (!activeTripId || !activeCategoryId || !editingItem) return;
    setTrips(trips.map((trip) => {
      if (trip.id !== activeTripId) return trip;
      return {
        ...trip,
        items: {
          ...trip.items,
          [activeCategoryId]: trip.items[activeCategoryId].map((item) =>
            item.id === editingItem.id
              ? { ...item, text: editingItem.text.trim(), link: undefined, notes: editingItem.notes.trim() || undefined }
              : item
          ),
        },
      };
    }));
    setEditingItem(null);
    setScreen('list');
  };

  const addItemsFromText = (text: string) => {
    const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    return lines.map((line, index) => {
      let cleanText = line.replace(/^[-*•]\s*/, '').replace(/^\[[ xX]\]\s*/, '').replace(/^[○◯]\s*/, '').trim();
      return { id: Date.now().toString() + index, text: cleanText, completed: false };
    });
  };

  const handleAddItem = () => {
    if (!newItemText.trim() || !activeTripId || !activeCategoryId) return;
    const newItems = addItemsFromText(newItemText);
    setTrips(trips.map((trip) => {
      if (trip.id !== activeTripId) return trip;
      return { ...trip, items: { ...trip.items, [activeCategoryId]: [...(trip.items[activeCategoryId] || []), ...newItems] } };
    }));
    setNewItemText('');
    setScreen('list');
  };

  const handleAddInlineItem = () => {
    if (!inlineItemText.trim() || !activeTripId || !activeCategoryId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newItems = addItemsFromText(inlineItemText);
    setTrips(trips.map((trip) => {
      if (trip.id !== activeTripId) return trip;
      return { ...trip, items: { ...trip.items, [activeCategoryId]: [...(trip.items[activeCategoryId] || []), ...newItems] } };
    }));
    setInlineItemText('');
  };

  const handleArchiveTrip = () => {
    if (!activeTripId) return;
    setTrips(trips.map((x) => (x.id === activeTripId ? { ...x, archived: !x.archived } : x)));
    setScreen('trips');
  };

  const handleDeleteTrip = () => {
    if (!activeTripId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t.deleteTrip,
      t.deleteTripConfirm,
      [
        { text: t.cancel, style: 'cancel' },
        { text: lang === 'zh' ? '删除' : 'Delete', style: 'destructive', onPress: () => {
          setTrips(trips.filter((x) => x.id !== activeTripId));
          setActiveTripId(null);
          setScreen('trips');
        }},
      ]
    );
  };

  const handleReorderCategories = useCallback(({ data }: { data: Category[] }) => {
    if (!activeTripId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTrips(prev => prev.map(x => x.id === activeTripId ? { ...x, categories: data } : x));
  }, [activeTripId]);

  const renderReorderItem = useCallback(({ item, drag, isActive }: RenderItemParams<Category>) => (
    <ScaleDecorator>
      <Pressable onLongPress={drag} disabled={isActive} style={[styles.reorderRow, isActive && styles.reorderRowActive]}>
        <Ionicons name="menu" size={22} color="#9ca3af" style={{ marginRight: 12 }} />
        <View style={[styles.reorderDot, getBgStyle(item.color)]} />
        <Text style={styles.reorderText} numberOfLines={1}>{item.name}</Text>
      </Pressable>
    </ScaleDecorator>
  ), []);

  const handleDuplicateTrip = () => {
    if (!activeTrip) return;
    setTemplateTripId(activeTrip.id);
    setNewTripData({ destination: `${activeTrip.destination} (Copy)`, startDate: '', endDate: '', icon: activeTrip.icon || '✈️', color: activeTrip.color || '#039BE5' });
    setScreen('add_trip');
  };

  const handleGenerateItinerary = async () => {
    if (!activeTrip) return;
    if (!isConfigured()) {
      Alert.alert(lang === 'zh' ? '缺少 API 配置' : 'Missing API config', lang === 'zh' ? '请设置 EXPO_PUBLIC_GEMINI_API_KEY 或 EXPO_PUBLIC_GEMINI_PROXY_URL。' : 'Set EXPO_PUBLIC_GEMINI_API_KEY (dev) or EXPO_PUBLIC_GEMINI_PROXY_URL (prod).');
      return;
    }
    setIsGeneratingItinerary(true);
    setAiItinerary('');
    try {
      let itemsContext = '';
      activeTrip.categories.forEach(cat => {
        const catItems = activeTrip.items[cat.id] || [];
        if (catItems.length > 0) {
          itemsContext += `\n${cat.name}: ${catItems.map(i => i.text).join(', ')}`;
        }
      });
      let transportContext = '';
      (activeTrip.transports || []).forEach(f => {
        const parts = [f.type, f.flightNumber, f.from && f.to ? `${f.from} → ${f.to}` : f.from || f.to, f.departureTime ? formatDateDisplay(f.departureTime) : ''].filter(Boolean);
        if (parts.length) transportContext += `\n- ${parts.join(', ')}`;
      });
      let accContext = '';
      (activeTrip.accommodations || []).forEach(a => {
        const parts = [a.name, a.address, a.checkIn ? `Check-in: ${formatDateDisplay(a.checkIn)}` : '', a.checkOut ? `Check-out: ${formatDateDisplay(a.checkOut)}` : ''].filter(Boolean);
        if (parts.length) accContext += `\n- ${parts.join(', ')}`;
      });
      const dateRange = activeTrip.startDate
        ? `from ${activeTrip.startDate} to ${activeTrip.endDate || 'unknown end date'}`
        : 'dates not yet decided';
      const prompt = `You are an expert travel planner. Create a detailed, day-by-day itinerary for a trip to ${activeTrip.destination}.\nThe trip is ${dateRange}.${transportContext ? `\n\nTransport details:${transportContext}` : ''}${accContext ? `\n\nAccommodation details:${accContext}` : ''}\n\nHere are items from the user's checklists:${itemsContext}\n\nPlan the itinerary around the actual transport schedule and hotel locations. Recommend famous local food and must-see attractions for the destination.\n\nUse this exact format for easy reading:\n- Start each day with "Day X:" or "第X天：" as a clear header\n- Use short bullet points (one line each, start with "-")\n- Add a blank line between days\n- Keep bullets concise (under 80 chars when possible)\n- Group by time: Morning / Afternoon / Evening when helpful\n\nRespond in ${lang === 'zh' ? 'Chinese' : 'English'}.`;
      const fullText = await generateItinerary(prompt);
      const charsPerTick = Math.max(2, Math.ceil(fullText.length / 100));
      let pos = 0;
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          pos = Math.min(pos + charsPerTick, fullText.length);
          setAiItinerary(fullText.substring(0, pos));
          if (pos >= fullText.length) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });
    } catch (err: any) {
      console.error('Error generating itinerary:', err);
      Alert.alert('Error', err?.message || (lang === 'zh' ? '行程生成失败，请重试。' : 'Failed to generate itinerary. Please try again.'));
    } finally {
      setIsGeneratingItinerary(false);
    }
  };

  const processVoiceCommand = async (base64Audio: string, mimeType: string) => {
    try {
      if (!isConfigured()) { Alert.alert('Missing API config'); return; }
      const existingCategories = activeTrip?.categories || [];
      const categoryNames = existingCategories.map(c => c.name).join(', ');
      const currentCategoryContext = (screen === 'list' && activeCategory)
        ? `\nThe user is currently viewing the "${getCategoryDisplayName(activeCategory)}" category. If the item doesn't explicitly belong to another category, put it in "${getCategoryDisplayName(activeCategory)}".`
        : '';
      const systemPrompt = `You are a travel assistant. The user is dictating items to add to their travel checklist.\nExtract the items they want to add.\nExisting categories: ${categoryNames}.${currentCategoryContext}\nIf an item fits an existing category, use that exact category name.\nIf it doesn't fit, suggest a short new category name and a single emoji for categoryIcon (like 🍜, 📍, 🚌, 💊, etc.).`;
      const itemsToAdd = await processVoiceAudio(base64Audio, mimeType, systemPrompt);
      if (itemsToAdd.length > 0 && activeTripId) {
        setTrips(prevTrips => prevTrips.map(trip => {
          if (trip.id !== activeTripId) return trip;
          let updatedCategories = [...trip.categories];
          let updatedItems = { ...trip.items };
          itemsToAdd.forEach((item) => {
            let category = updatedCategories.find(c => c.name === item.categoryName);
            if (!category) {
              const iconName = item.categoryIcon || '';
              category = { id: Date.now().toString() + Math.random(), name: item.categoryName, icon: iconName, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
              updatedCategories.push(category);
            }
            if (!updatedItems[category.id]) updatedItems[category.id] = [];
            updatedItems[category.id].push({ id: Date.now().toString() + Math.random(), text: item.itemName, completed: false });
          });
          return { ...trip, categories: updatedCategories, items: updatedItems };
        }));
      }
    } catch (err: any) {
      console.error('Error processing voice command:', err);
      Alert.alert('Error', err?.message || (lang === 'zh' ? '语音处理失败。' : 'Failed to process voice command.'));
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        if (uri) {
          setIsProcessingVoice(true);
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          await processVoiceCommand(base64, 'audio/mp4');
        }
      } catch (err) {
        console.error('Error stopping recording:', err);
        setIsProcessingVoice(false);
      }
    } else {
      if (!isConfigured()) {
        Alert.alert(lang === 'zh' ? '缺少 API 配置' : 'Missing API config', lang === 'zh' ? '请先设置 Gemini API Key。' : 'Set up Gemini API key first.');
        return;
      }
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(lang === 'zh' ? '需要权限' : 'Permission needed', lang === 'zh' ? '需要麦克风权限来使用语音输入。' : 'Microphone access is required for voice input.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        setIsRecording(true);
      } catch (err) {
        console.error('Error starting recording:', err);
        Alert.alert('Error', lang === 'zh' ? '无法启动录音。' : 'Could not start recording.');
      }
    }
  };

  const sortedTrips = [...trips].sort((a, b) => {
    if (sortMode !== 'upcoming') return 0;
    const aTime = a.startDate ? new Date(a.startDate).getTime() : Infinity;
    const bTime = b.startDate ? new Date(b.startDate).getTime() : Infinity;
    return aTime - bTime;
  });
  const activeTripsList = sortedTrips.filter((x) => !x.archived);
  const archivedTripsList = sortedTrips.filter((x) => x.archived);
  const upcomingTrips = activeTripsList.filter((x) => getDaysDiff(x.endDate || x.startDate) >= 0);
  const pastTrips = activeTripsList.filter((x) => getDaysDiff(x.endDate || x.startDate) < 0);

  const openShareScreen = () => {
    if (!activeTrip) return;
    const hasFlightInfo = (activeTrip.transports || []).some(f => f.flightNumber || f.departureTime || f.arrivalTime);
    const hasAccInfo = (activeTrip.accommodations || []).some(a => a.name || a.address || a.checkIn || a.checkOut);
    const initialSelection: Record<string, boolean> = { flight: hasFlightInfo, accommodation: hasAccInfo };
    activeTrip.categories.forEach((c) => { initialSelection[c.id] = true; });
    setShareSelection(initialSelection);
    setCopied(false);
    setScreen('share');
  };

  const generateShareText = () => {
    if (!activeTrip) return '';
    let text = `✈️ ${activeTrip.destination}\n📅 ${formatDateDisplay(activeTrip.startDate)} ${activeTrip.endDate ? `→ ${formatDateDisplay(activeTrip.endDate)}` : ''}\n\n`;
    if (shareSelection.flight && activeTrip.transports) {
      activeTrip.transports.forEach(f => {
        if (f.flightNumber || f.from || f.to || f.departureTime || f.arrivalTime) {
          text += `${f.type || '✈️'} ${t.flight}:\n`;
          if (f.flightNumber) text += `${f.flightNumber}\n`;
          if (f.from || f.to) text += `${f.from || ''}${f.from && f.to ? ' → ' : ''}${f.to || ''}\n`;
          if (f.departureTime) text += `${t.depTime}: ${formatDateDisplay(f.departureTime)}\n`;
          if (f.arrivalTime) text += `${t.arrTime}: ${formatDateDisplay(f.arrivalTime)}\n\n`;
        }
      });
    }
    if (shareSelection.accommodation && activeTrip.accommodations) {
      activeTrip.accommodations.forEach(a => {
        if (a.name || a.address || a.checkIn || a.checkOut) {
          text += `🏨 ${t.accommodation}:\n`;
          if (a.name) text += `${a.name}\n`;
          if (a.address) text += `${a.address}\n`;
          if (a.checkIn) text += `${t.checkIn}: ${formatDateDisplay(a.checkIn)}\n`;
          if (a.checkOut) text += `${t.checkOut}: ${formatDateDisplay(a.checkOut)}\n\n`;
        }
      });
    }
    activeTrip.categories.forEach((cat) => {
      if (shareSelection[cat.id]) {
        const items = activeTrip.items[cat.id] || [];
        if (items.length > 0) {
          text += `• ${cat.name}:\n`;
          items.forEach((item) => { text += `${item.completed ? '✅' : '⬜'} ${item.text}\n`; });
          text += '\n';
        }
      }
    });
    return text.trim();
  };

  const shareAsPDF = async (title: string, text: string) => {
    try {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:24px;font-size:14px;line-height:1.6;color:#333}pre{white-space:pre-wrap;word-wrap:break-word;margin:0}h1{font-size:18px;margin-bottom:16px;color:#111}</style></head><body><h1>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1><pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '\n')}</pre></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
      } else {
        await Clipboard.setStringAsync(text);
        Alert.alert('✓', lang === 'zh' ? 'PDF 生成成功，但当前环境无法分享。已复制文本。' : 'PDF created. Sharing not available — text copied.');
      }
    } catch (err: any) {
      console.error('Share PDF error:', err);
      Alert.alert('Error', err?.message || (lang === 'zh' ? '分享失败' : 'Failed to share'));
    }
  };

  const handleShareAction = async () => {
    await shareAsPDF(activeTrip?.destination || 'Trip', generateShareText());
  };

  const goBackFromModal = () => {
    setOpenDatePicker(null);
    setEditingItem(null);
    if (screen === 'add_item' || screen === 'edit_item') setScreen('list');
    else if (screen === 'edit_flight') setScreen('transport_list');
    else if (screen === 'edit_acc') setScreen('acc_list');
    else if (['add_category', 'transport_list', 'acc_list', 'share', 'notes', 'expenses', 'edit_trip'].includes(screen)) setScreen('home');
    else setScreen('trips');
    if (screen === 'add_trip') setTemplateTripId(null);
  };

  const getModalTitle = () => {
    if (screen === 'add_item') return t.newItem;
    if (screen === 'edit_item') return t.editItem;
    if (screen === 'add_category') return t.addCategory;
    if (screen === 'edit_flight') return t.flight;
    if (screen === 'edit_acc') return t.accommodation;
    if (screen === 'transport_list') return t.flight;
    if (screen === 'acc_list') return t.accommodation;
    if (screen === 'share') return t.shareTrip;
    if (screen === 'notes') return t.notes;
    if (screen === 'expenses') return t.expenses;
    if (screen === 'edit_trip') return t.editTrip;
    return t.addTrip;
  };

  const saveModal = () => {
    if (screen === 'add_item') handleAddItem();
    else if (screen === 'edit_item') handleSaveItemEdit();
    else if (screen === 'add_category') handleAddCategory();
    else if (screen === 'edit_flight') handleSaveTransport();
    else if (screen === 'edit_acc') handleSaveAcc();
    else if (screen === 'notes') handleSaveNotes();
    else if (screen === 'edit_trip') handleSaveTripInfo();
    else if (screen === 'add_trip') handleAddTrip();
  };

  const showSaveButton = !['share', 'expenses', 'transport_list', 'acc_list'].includes(screen);

  if (!dataLoaded) {
    return (
      <GestureHandlerRootView style={styles.flex1}>
        <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]} edges={['top']}>
          <ActivityIndicator size="large" color="#007AFF" />
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex1}>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          bounces={true}
          overScrollMode="always"
          refreshControl={screen === 'trips' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {/* --- TRIPS DASHBOARD --- */}
          {screen === 'trips' && (
            <View style={styles.screenPadding}>
              <View style={styles.headerRow}>
                <Text style={styles.title}>{t.myTrips}</Text>
                <View style={styles.headerActions}>
                  <Pressable onPress={() => setShowSortMenu(!showSortMenu)} style={styles.iconButton}>
                    <Ionicons name="swap-vertical" size={20} color="#374151" />
                  </Pressable>
                  {showSortMenu && (
                    <View style={styles.sortMenuWrap}>
                      <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSortMenu(false)} />
                      <View style={styles.sortMenu}>
                        <Pressable onPress={() => { setSortMode('upcoming'); setShowSortMenu(false); }} style={[styles.sortItem, sortMode === 'upcoming' && styles.sortItemActive]}>
                          <Text style={[styles.sortItemText, sortMode === 'upcoming' && styles.sortItemTextActive]}>{t.sortByUpcoming}</Text>
                          {sortMode === 'upcoming' && <Ionicons name="checkmark" size={18} color="#2563eb" />}
                        </Pressable>
                        <Pressable onPress={() => { setSortMode('manual'); setShowSortMenu(false); }} style={[styles.sortItem, sortMode === 'manual' && styles.sortItemActive]}>
                          <Text style={[styles.sortItemText, sortMode === 'manual' && styles.sortItemTextActive]}>{t.sortManually}</Text>
                          {sortMode === 'manual' && <Ionicons name="checkmark" size={18} color="#2563eb" />}
                        </Pressable>
                      </View>
                    </View>
                  )}
                  <Pressable onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')} style={styles.langButton}>
                    <Ionicons name="globe-outline" size={18} color="#374151" />
                    <Text style={styles.langText}>{lang === 'en' ? 'EN' : '中'}</Text>
                  </Pressable>
                </View>
              </View>

              {trips.length === 0 && (
                <View style={styles.emptyTrips}>
                  <View style={styles.emptyTripsIconWrap}>
                    <Ionicons name="airplane-outline" size={48} color="#007AFF" />
                  </View>
                  <Text style={styles.emptyTripsTitle}>{t.emptyTripsTitle}</Text>
                  <Text style={styles.emptyTripsSub}>{t.emptyTripsSubtitle}</Text>
                  <View style={styles.emptyTripsHints}>
                    <View style={styles.emptyTripsHintRow}>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#22c55e" />
                      <Text style={styles.emptyTripsHintText}>{t.emptyTripsHint1}</Text>
                    </View>
                    <View style={styles.emptyTripsHintRow}>
                      <Ionicons name="sparkles-outline" size={16} color="#f59e0b" />
                      <Text style={styles.emptyTripsHintText}>{t.emptyTripsHint2}</Text>
                    </View>
                    <View style={styles.emptyTripsHintRow}>
                      <Ionicons name="share-outline" size={16} color="#3b82f6" />
                      <Text style={styles.emptyTripsHintText}>{t.emptyTripsHint3}</Text>
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.tripList}>
                {sortMode === 'manual' ? (
                  activeTripsList.map((trip) => {
                    const status = getTripStatus(trip.startDate, trip.endDate);
                    return (
                      <Pressable key={trip.id} onPress={() => openTrip(trip.id)} style={[styles.tripCard, getBgStyle(trip.color || '#039BE5')]}>
                        <View style={styles.tripCardIconWrap}>
                          <Text style={styles.tripCardEmoji}>{getTripEmoji(trip.icon)}</Text>
                        </View>
                        <View style={styles.tripCardBody}>
                          <View style={styles.tripCardTitleRow}>
                            <Text style={styles.tripCardTitle} numberOfLines={1}>{trip.destination}</Text>
                            <View style={styles.tripCardBadge}><Text style={styles.tripCardBadgeText}>{status.text}</Text></View>
                          </View>
                          <View style={styles.tripCardDates}>
                            <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.tripCardDatesText}>{getTripDatesDisplay(trip)}</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                ) : (
                  <>
                    {upcomingTrips.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t.upcoming}</Text>
                        {upcomingTrips.map((trip) => {
                          const status = getTripStatus(trip.startDate, trip.endDate);
                          return (
                            <Pressable key={trip.id} onPress={() => openTrip(trip.id)} style={[styles.tripCard, getBgStyle(trip.color || '#039BE5')]}>
                              <View style={styles.tripCardIconWrap}><Text style={styles.tripCardEmoji}>{getTripEmoji(trip.icon)}</Text></View>
                              <View style={styles.tripCardBody}>
                                <View style={styles.tripCardTitleRow}>
                                  <Text style={styles.tripCardTitle} numberOfLines={1}>{trip.destination}</Text>
                                  <View style={styles.tripCardBadge}><Text style={styles.tripCardBadgeText}>{status.text}</Text></View>
                                </View>
                                <View style={styles.tripCardDates}>
                                  <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.8)" />
                                  <Text style={styles.tripCardDatesText}>{getTripDatesDisplay(trip)}</Text>
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                    {pastTrips.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t.past}</Text>
                        {pastTrips.map((trip) => (
                          <Pressable key={trip.id} onPress={() => openTrip(trip.id)} style={[styles.tripCard, getBgStyle(trip.color || '#039BE5'), styles.tripCardPast]}>
                            <View style={styles.tripCardIconWrap}><Text style={styles.tripCardEmoji}>{getTripEmoji(trip.icon)}</Text></View>
                            <View style={styles.tripCardBody}>
                              <Text style={styles.tripCardTitle} numberOfLines={1}>{trip.destination}</Text>
                              <View style={styles.tripCardDates}>
                                <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.tripCardDatesText}>{getTripDatesDisplay(trip)}</Text>
                              </View>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                )}

                {archivedTripsList.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="archive-outline" size={14} color="#6b7280" />
                      <Text style={styles.sectionTitle}>{t.archivedTrips}</Text>
                    </View>
                    {archivedTripsList.map((trip) => (
                      <Pressable key={trip.id} onPress={() => openTrip(trip.id)} style={styles.tripCardArchived}>
                        <View style={styles.tripCardIconWrapArchived}><Text style={styles.tripCardEmojiArchived}>{getTripEmoji(trip.icon)}</Text></View>
                        <View style={styles.tripCardBody}>
                          <Text style={styles.tripCardTitleArchived} numberOfLines={1}>{trip.destination}</Text>
                          <View style={styles.tripCardDatesArchived}>
                            <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                            <Text style={styles.tripCardDatesTextArchived}>{trip.startDate ? formatDateDisplay(trip.startDate) : t.dateOnlyPlaceholder}</Text>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* --- TRIP HOME --- */}
          {screen === 'home' && activeTrip && (
            <View style={[styles.screenPadding, styles.homeContentMinHeight]}>
              <View style={styles.navRow}>
                <Pressable onPress={() => setScreen('trips')} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={24} color="#007AFF" />
                  <Text style={styles.backButtonText}>{t.myTrips}</Text>
                </Pressable>
                <Pressable onPress={openShareScreen} style={styles.iconButton}>
                  <Ionicons name="share-social-outline" size={20} color="#374151" />
                </Pressable>
              </View>

              <Pressable onPress={() => { setEditTripData({ destination: activeTrip.destination, startDate: activeTrip.startDate, endDate: activeTrip.endDate || '', icon: activeTrip.icon || '✈️', color: activeTrip.color || '#039BE5' }); setScreen('edit_trip'); }} style={[styles.tripInfoCard, getBgStyle(activeTrip.color)]}>
                <View style={styles.tripInfoHeader}>
                  <View style={styles.tripInfoTitleRow}>
                    <View style={styles.tripInfoIconWrap}><Text style={styles.tripInfoEmoji}>{getTripEmoji(activeTrip.icon)}</Text></View>
                    <Text style={styles.tripInfoTitle} numberOfLines={2}>{activeTrip.destination}</Text>
                  </View>
                  <View style={[styles.tripInfoBadge, getTripStatus(activeTrip.startDate, activeTrip.endDate).badgeStyle]}>
                    <Text style={[styles.tripInfoBadgeText, getTripStatus(activeTrip.startDate, activeTrip.endDate).textStyle]}>{getTripStatus(activeTrip.startDate, activeTrip.endDate).text}</Text>
                  </View>
                </View>
                <View style={styles.tripInfoDatesBar}>
                  {!activeTrip.startDate && !activeTrip.endDate ? (
                    <Text style={styles.tripInfoDatesText}>{t.dateOnlyPlaceholder}</Text>
                  ) : (
                    <>
                      <Text style={styles.tripInfoDatesText}>{formatDateDisplay(activeTrip.startDate)}</Text>
                      <Text style={styles.tripInfoDatesArrow}>→</Text>
                      <Text style={styles.tripInfoDatesText}>{activeTrip.endDate ? formatDateDisplay(activeTrip.endDate) : '?'}</Text>
                    </>
                  )}
                </View>
              </Pressable>

              <View style={styles.infoGrid}>
                <Pressable style={styles.infoCard} onPress={() => setScreen('transport_list')}>
                  {(activeTrip.transports || []).length > 0 ? (
                    <>
                      <View style={styles.infoCardHeader}>
                        <View style={styles.infoCardTitleRow}>
                          <Ionicons name="train-outline" size={16} color="#3b82f6" />
                          <Text style={[styles.infoCardLabel, { color: '#3b82f6' }]}>{t.flight}</Text>
                        </View>
                      </View>
                      <Text style={styles.infoCardValue} numberOfLines={1}>{activeTrip.transports![0].type} {activeTrip.transports![0].flightNumber}</Text>
                      <Text style={styles.infoCardSub} numberOfLines={1}>
                        {activeTrip.transports![0].from}{activeTrip.transports![0].from && activeTrip.transports![0].to ? ' → ' : ''}{activeTrip.transports![0].to}
                      </Text>
                    </>
                  ) : (
                    <View style={styles.infoCardEmpty}>
                      <View style={styles.infoCardIconWrapEmpty}><Ionicons name="train-outline" size={24} color="#9ca3af" /></View>
                      <Text style={styles.infoCardEmptyText}>{t.addFlightEmpty}</Text>
                    </View>
                  )}
                </Pressable>

                <Pressable style={styles.infoCard} onPress={() => setScreen('acc_list')}>
                  {(activeTrip.accommodations || []).length > 0 ? (
                    <>
                      <View style={styles.infoCardHeader}>
                        <View style={styles.infoCardTitleRow}>
                          <Ionicons name="bed-outline" size={16} color="#f97316" />
                          <Text style={[styles.infoCardLabel, { color: '#f97316' }]}>{t.accommodation}</Text>
                        </View>
                      </View>
                      <Text style={styles.infoCardValue} numberOfLines={1}>{activeTrip.accommodations![0].name}</Text>
                      <Text style={styles.infoCardSub} numberOfLines={1}>
                        {activeTrip.accommodations![0].checkIn ? formatDateDisplay(activeTrip.accommodations![0].checkIn) : ''}{activeTrip.accommodations![0].checkIn && activeTrip.accommodations![0].checkOut ? ' → ' : ''}{activeTrip.accommodations![0].checkOut ? formatDateDisplay(activeTrip.accommodations![0].checkOut) : ''}
                      </Text>
                    </>
                  ) : (
                    <View style={styles.infoCardEmpty}>
                      <View style={styles.infoCardIconWrapEmpty}><Ionicons name="bed-outline" size={24} color="#9ca3af" /></View>
                      <Text style={styles.infoCardEmptyText}>{t.addAccEmpty}</Text>
                    </View>
                  )}
                </Pressable>

                <Pressable onPress={() => { setEditNotesData(activeTrip.notes || ''); setScreen('notes'); }} style={styles.infoCard}>
                  {activeTrip.notes ? (
                    <>
                      <View style={styles.infoCardHeader}>
                        <View style={styles.infoCardIconWrap}><Ionicons name="document-text-outline" size={16} color="#a855f7" /></View>
                        <Text style={[styles.infoCardLabel, { color: '#a855f7' }]}>{t.notes}</Text>
                      </View>
                      <Text style={styles.infoCardSub} numberOfLines={3}>{activeTrip.notes}</Text>
                    </>
                  ) : (
                    <View style={styles.infoCardEmpty}>
                      <View style={styles.infoCardIconWrapEmpty}><Ionicons name="document-text-outline" size={24} color="#9ca3af" /></View>
                      <Text style={styles.infoCardEmptyText}>{t.notes}</Text>
                    </View>
                  )}
                </Pressable>

                <Pressable onPress={() => setScreen('expenses')} style={styles.infoCard}>
                  {activeTrip.expenses && activeTrip.expenses.length > 0 ? (
                    <>
                      <View style={styles.infoCardHeader}>
                        <View style={styles.infoCardIconWrap}><Ionicons name="cash-outline" size={16} color="#22c55e" /></View>
                        <Text style={[styles.infoCardLabel, { color: '#22c55e' }]}>{t.expenses}</Text>
                      </View>
                      <Text style={styles.infoCardValue}>
                        {activeTrip.expenses[0].currency}{activeTrip.expenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
                      </Text>
                      <Text style={styles.infoCardSub}>{activeTrip.expenses.length} items</Text>
                    </>
                  ) : (
                    <View style={styles.infoCardEmpty}>
                      <View style={styles.infoCardIconWrapEmpty}><Ionicons name="cash-outline" size={24} color="#9ca3af" /></View>
                      <Text style={styles.infoCardEmptyText}>{t.expenses}</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              {/* Tab switcher */}
              <View style={styles.tabRow}>
                <Pressable onPress={() => setHomeTab('lists')} style={styles.tabButton}>
                  <Text style={[styles.tabText, homeTab === 'lists' && styles.tabTextActive]}>{t.checklists}</Text>
                  {homeTab === 'lists' && <View style={styles.tabIndicator} />}
                </Pressable>
                <Pressable onPress={() => setHomeTab('ai_planner')} style={styles.tabButton}>
                  <Text style={[styles.tabText, homeTab === 'ai_planner' && styles.tabTextActive]}>{t.aiPlanner}</Text>
                  {homeTab === 'ai_planner' && <View style={styles.tabIndicator} />}
                </Pressable>
              </View>

              {homeTab === 'lists' ? (
                <>
                  <View style={styles.categoryGrid}>
                    {activeTrip.categories.map((category) => {
                      const progress = getProgress(activeTrip, category.id);
                      const total = activeTrip.items[category.id]?.length || 0;
                      const completed = activeTrip.items[category.id]?.filter((i) => i.completed).length || 0;
                      return (
                        <Pressable key={category.id} onPress={() => { setActiveCategoryId(category.id); setScreen('list'); }} style={styles.categoryCard}>
                          <View style={[styles.categoryDot, getBgStyle(category.color)]} />
                          <Text style={styles.categoryName} numberOfLines={1}>{getCategoryDisplayName(category)}</Text>
                          <Text style={styles.categoryCount}>{completed}/{total}</Text>
                          <View style={styles.progressBar}>
                            <View style={[styles.progressFill, getBgStyle(category.color), { width: `${progress}%` }]} />
                          </View>
                        </Pressable>
                      );
                    })}
                    <Pressable onPress={() => setScreen('add_category')} style={styles.addCategoryCard}>
                      <Ionicons name="add" size={32} color="#9ca3af" />
                      <Text style={styles.addCategoryText}>{t.addCategory}</Text>
                    </Pressable>
                  </View>
                  {activeTrip.categories.length > 1 && (
                    <Pressable onPress={() => setShowReorder(true)} style={styles.reorderButton}>
                      <Ionicons name="reorder-three-outline" size={20} color="#6b7280" />
                      <Text style={styles.reorderButtonText}>{t.reorderCategories}</Text>
                    </Pressable>
                  )}
                  <Modal visible={showReorder} transparent animationType="slide">
                    <View style={styles.emojiModalOverlay}>
                      <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowReorder(false)} />
                      <View style={[styles.emojiModalSheet, { maxHeight: '60%', paddingBottom: 36 }]}>
                        <View style={styles.emojiModalHandle} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>{t.reorderCategories}</Text>
                          <Pressable onPress={() => setShowReorder(false)} style={{ paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#007AFF', borderRadius: 16 }}>
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{t.reorderDone}</Text>
                          </Pressable>
                        </View>
                        <Text style={{ fontSize: 12, color: '#9ca3af', paddingHorizontal: 20, marginBottom: 12 }}>{lang === 'zh' ? '长按拖动排序' : 'Long press & drag to reorder'}</Text>
                        <DraggableFlatList
                          data={activeTrip.categories}
                          keyExtractor={(item) => item.id}
                          renderItem={renderReorderItem}
                          onDragEnd={handleReorderCategories}
                        />
                      </View>
                    </View>
                  </Modal>

                  <View style={styles.bottomActions}>
                    <Pressable onPress={handleDuplicateTrip} style={styles.secondaryButton}>
                      <Ionicons name="copy-outline" size={20} color="#374151" />
                      <Text style={styles.secondaryButtonText}>{t.duplicate}</Text>
                    </Pressable>
                    <Pressable onPress={handleArchiveTrip} style={[styles.secondaryButton, activeTrip.archived && styles.secondaryButtonAlt]}>
                      <Ionicons name="archive-outline" size={20} color="#374151" />
                      <Text style={styles.secondaryButtonText}>{activeTrip.archived ? t.unarchive : t.archive}</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={handleDeleteTrip} style={styles.deleteTripButton}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    <Text style={styles.deleteTripButtonText}>{t.deleteTrip}</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.aiPlannerCard}>
                  {!aiItinerary && !isGeneratingItinerary ? (
                    <View style={styles.aiPlannerEmpty}>
                      <View style={styles.aiPlannerIconWrap}>
                        <Ionicons name="sparkles" size={28} color="#007AFF" />
                      </View>
                      <Text style={styles.aiPlannerTitle}>{t.aiPlanner}</Text>
                      <Text style={styles.aiPlannerDesc}>
                        {lang === 'zh' ? '基于您的目的地和清单，为您生成智能行程规划。' : 'Generate a smart itinerary based on your destination and checklists.'}
                      </Text>
                      <Pressable
                        onPress={handleGenerateItinerary}
                        disabled={isGeneratingItinerary}
                        style={[styles.aiGenerateButton, isGeneratingItinerary && styles.aiGenerateButtonDisabled]}
                      >
                        {isGeneratingItinerary ? (
                          <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                        ) : (
                          <Ionicons name="sparkles" size={20} color="#fff" style={{ marginRight: 8 }} />
                        )}
                        <Text style={styles.aiGenerateButtonText}>
                          {isGeneratingItinerary ? t.generatingItinerary : t.generateItinerary}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View>
                      <View style={styles.aiResultHeader}>
                        <View style={styles.aiResultTitleRow}>
                          <Ionicons name="sparkles" size={20} color="#007AFF" />
                          <Text style={styles.aiResultTitle}>{t.aiPlanner}</Text>
                        </View>
                        <Pressable onPress={handleGenerateItinerary} disabled={isGeneratingItinerary}>
                          {isGeneratingItinerary ? (
                            <ActivityIndicator size="small" color="#007AFF" />
                          ) : (
                            <Ionicons name="refresh" size={20} color="#007AFF" />
                          )}
                        </Pressable>
                      </View>
                      {aiItinerary ? (
                        <View style={styles.aiResultContent}>
                          {(() => {
                            const blocks = parseItineraryBlocks(aiItinerary);
                            return blocks.map((block, i) => (
                              <View key={i} style={block.type === 'day' ? styles.aiDayBlock : block.type === 'bullet' ? styles.aiBulletBlock : styles.aiParagraphBlock}>
                                {block.type === 'bullet' && <Text style={styles.aiBullet}>•</Text>}
                                <Text style={block.type === 'day' ? styles.aiDayText : block.type === 'bullet' ? styles.aiBulletText : styles.aiParagraphText} selectable>
                                  {block.text}{i === blocks.length - 1 && isGeneratingItinerary ? ' ▍' : ''}
                                </Text>
                              </View>
                            ));
                          })()}
                        </View>
                      ) : (
                        <Text style={styles.aiResultText} selectable>
                          {lang === 'zh' ? '正在生成行程...' : 'Generating itinerary...'}
                          {isGeneratingItinerary ? ' ▍' : ''}
                        </Text>
                      )}
                      {aiItinerary && !isGeneratingItinerary ? (
                        <View style={styles.aiActionRow}>
                          <Pressable
                            style={styles.aiActionButton}
                            onPress={() => shareAsPDF(`${activeTrip?.destination ?? 'Trip'} — AI Itinerary`, aiItinerary)}
                          >
                            <Ionicons name="share-outline" size={18} color="#007AFF" />
                            <Text style={styles.aiActionButtonText}>{t.shareItinerary}</Text>
                          </Pressable>
                          <Pressable
                            style={styles.aiActionButton}
                            onPress={async () => {
                              await Clipboard.setStringAsync(aiItinerary);
                              Alert.alert('✓', t.copiedToClipboard);
                            }}
                          >
                            <Ionicons name="copy-outline" size={18} color="#007AFF" />
                            <Text style={styles.aiActionButtonText}>{t.copyItinerary}</Text>
                          </Pressable>
                          <Pressable
                            style={styles.aiActionButton}
                            onPress={() => {
                              if (!activeTripId) return;
                              setTrips(trips.map((x) => x.id === activeTripId
                                ? { ...x, notes: (x.notes ? x.notes + '\n\n---\n\n' : '') + `🤖 AI Itinerary\n\n${aiItinerary}` }
                                : x));
                              Alert.alert('✓', t.savedToNotes);
                            }}
                          >
                            <Ionicons name="bookmark-outline" size={18} color="#007AFF" />
                            <Text style={styles.aiActionButtonText}>{t.saveToNotes}</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* --- LIST SCREEN --- */}
          {screen === 'list' && activeTrip && activeCategory && (
            <View style={styles.listScreen}>
              <View style={styles.navRow}>
                <Pressable onPress={() => setScreen('home')} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={24} color="#007AFF" />
                  <Text style={styles.backButtonText}>{t.back}</Text>
                </Pressable>
                <View style={styles.navActions}>
                  <Pressable onPress={handleDeleteCategory} style={[styles.iconButton, styles.deleteIconButton]}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                  <Pressable onPress={() => setScreen('add_item')} style={styles.addItemButton}>
                    <Ionicons name="add" size={22} color="#fff" />
                  </Pressable>
                </View>
              </View>

              <View style={styles.listContent}>
                <View style={styles.listHeader}>
                  <View style={[styles.listCategoryDot, getBgStyle(activeCategory.color)]} />
                  <Text style={styles.listTitle}>{getCategoryDisplayName(activeCategory)}</Text>
                </View>

                <View style={styles.itemListCard}>
                  {(activeTrip.items[activeCategory.id] || []).length === 0 ? (
                    <View style={styles.emptyList}>
                      <Text style={styles.emptyListText}>{t.noItems}</Text>
                      <Text style={styles.emptyListSub}>{t.tapToAdd}</Text>
                    </View>
                  ) : (
                    (activeTrip.items[activeCategory.id] || []).map((item, index) => {
                      const listLength = (activeTrip.items[activeCategory.id] || []).length;
                      return (
                        <Swipeable
                          key={item.id}
                          renderRightActions={() => (
                            <Pressable onPress={() => handleDeleteItem(item.id)} style={styles.swipeDeleteAction}>
                              <Ionicons name="trash-outline" size={22} color="#fff" />
                            </Pressable>
                          )}
                          overshootRight={false}
                        >
                          <View style={styles.itemRow}>
                            <Pressable onPress={() => handleToggleItem(item.id)} style={[styles.checkbox, item.completed && getBgStyle(activeCategory.color)]}>
                              {item.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </Pressable>
                            <Text style={[styles.itemText, item.completed && styles.itemTextCompleted]} numberOfLines={2}>{item.text}</Text>
                            <View style={styles.itemSortGroup}>
                              <Pressable onPress={() => handleMoveItem(item.id, 'up')} style={styles.itemSortBtn} disabled={index === 0}>
                                <Ionicons name="chevron-up" size={20} color={index === 0 ? '#d1d5db' : '#6b7280'} />
                              </Pressable>
                              <Pressable onPress={() => handleMoveItem(item.id, 'down')} style={styles.itemSortBtn} disabled={index === listLength - 1}>
                                <Ionicons name="chevron-down" size={20} color={index === listLength - 1 ? '#d1d5db' : '#6b7280'} />
                              </Pressable>
                            </View>
                            <Pressable onPress={() => { setEditingItem({ id: item.id, text: item.text, link: '', notes: [item.link, item.notes].filter(Boolean).join('\n') }); setScreen('edit_item'); }} style={styles.itemLinkBtn}>
                              <Ionicons name={item.link || item.notes ? "document-text-outline" : "create-outline"} size={20} color={item.link || item.notes ? "#007AFF" : "#9ca3af"} />
                            </Pressable>
                          </View>
                        </Swipeable>
                      );
                    })
                  )}
                </View>

                <View style={styles.inlineAddRow}>
                  <TextInput
                    value={inlineItemText}
                    onChangeText={setInlineItemText}
                    placeholder={t.addItemInlinePlaceholder}
                    placeholderTextColor="#9ca3af"
                    style={styles.inlineAddInput}
                    returnKeyType="done"
                    onSubmitEditing={handleAddInlineItem}
                    blurOnSubmit={false}
                  />
                  <Pressable onPress={handleAddInlineItem} style={[styles.inlineAddButton, !inlineItemText.trim() && styles.inlineAddButtonDisabled]} disabled={!inlineItemText.trim()}>
                    <Ionicons name="add-circle" size={28} color={inlineItemText.trim() ? '#007AFF' : '#d1d5db'} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {(screen === 'home' || screen === 'list') && (
          <View style={styles.voiceFabContainer}>
            <Pressable
              onPress={toggleRecording}
              disabled={isProcessingVoice}
              style={[
                styles.voiceFab,
                isRecording && styles.voiceFabRecording,
                isProcessingVoice && styles.voiceFabProcessing,
              ]}
            >
              {isProcessingVoice ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Ionicons name={isRecording ? 'stop' : 'mic'} size={24} color={isRecording ? '#fff' : '#111827'} />
              )}
            </Pressable>
          </View>
        )}

        {screen === 'trips' && (
          <View style={styles.tripsFooter}>
            <Pressable onPress={() => { setTemplateTripId(null); setScreen('add_trip'); }} style={styles.primaryButton}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.primaryButtonText}>{t.addTrip}</Text>
            </Pressable>
          </View>
        )}

        {/* --- MODAL OVERLAY (add/edit forms, share, etc.) --- */}
        {(screen === 'add_item' || screen === 'edit_item' || screen === 'add_trip' || screen === 'edit_trip' || screen === 'add_category' || screen === 'edit_flight' || screen === 'edit_acc' || screen === 'transport_list' || screen === 'acc_list' || screen === 'share' || screen === 'notes' || screen === 'expenses') && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalHeader}>
              <Pressable onPress={goBackFromModal}><Text style={styles.modalCancel}>{['transport_list', 'acc_list'].includes(screen) ? t.back : t.cancel}</Text></Pressable>
              <Text style={styles.modalTitle}>{getModalTitle()}</Text>
              {showSaveButton ? (
                <Pressable onPress={saveModal}><Text style={styles.modalSave}>{screen === 'add_item' ? t.addItem : t.save}</Text></Pressable>
              ) : (
                <View style={styles.modalPlaceholder} />
              )}
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled">
              {screen === 'share' && activeTrip && (
                <>
                  <Text style={styles.modalSectionLabel}>{t.selectToShare}</Text>
                  <View style={styles.shareOptionsCard}>
                    {(activeTrip.transports || []).length > 0 && (
                      <Pressable style={styles.shareOptionRow} onPress={() => setShareSelection({ ...shareSelection, flight: !shareSelection.flight })}>
                        <Text style={styles.shareOptionText}>{t.includeFlight} ({(activeTrip.transports || []).length})</Text>
                        <View style={[styles.checkboxSquare, shareSelection.flight && styles.checkboxSquareChecked]}>{shareSelection.flight && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
                      </Pressable>
                    )}
                    {(activeTrip.accommodations || []).length > 0 && (
                      <Pressable style={styles.shareOptionRow} onPress={() => setShareSelection({ ...shareSelection, accommodation: !shareSelection.accommodation })}>
                        <Text style={styles.shareOptionText}>{t.includeAcc} ({(activeTrip.accommodations || []).length})</Text>
                        <View style={[styles.checkboxSquare, shareSelection.accommodation && styles.checkboxSquareChecked]}>{shareSelection.accommodation && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
                      </Pressable>
                    )}
                    {activeTrip.categories.map((cat) => (
                      <Pressable key={cat.id} style={styles.shareOptionRow} onPress={() => setShareSelection({ ...shareSelection, [cat.id]: !shareSelection[cat.id] })}>
                        <View style={styles.shareOptionRowContent}>
                        <View style={[styles.shareOptionDot, getBgStyle(cat.color)]} />
                        <Text style={styles.shareOptionText}>{cat.name}</Text>
                      </View>
                        <View style={[styles.checkboxSquare, shareSelection[cat.id] && styles.checkboxSquareChecked]}>{shareSelection[cat.id] && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.sharePreview}>
                    <Text style={styles.sharePreviewText} selectable>{generateShareText()}</Text>
                  </View>
                  <Pressable onPress={handleShareAction} style={styles.primaryButton}>
                    <Ionicons name="share-social-outline" size={24} color="#fff" />
                    <Text style={styles.primaryButtonText}>{t.shareVia}</Text>
                  </Pressable>
                </>
              )}

              {screen === 'add_item' && (
                <View style={styles.inputCard}>
                  <TextInput
                    value={newItemText}
                    onChangeText={setNewItemText}
                    placeholder={t.addItemModalPlaceholder}
                    style={styles.textArea}
                    multiline
                    numberOfLines={4}
                  />
                </View>
              )}

              {screen === 'edit_item' && editingItem && (
                <View style={styles.inputCard}>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>{t.newItem}</Text>
                    <TextInput
                      value={editingItem.text}
                      onChangeText={(text) => setEditingItem({ ...editingItem, text })}
                      placeholder={t.editItemNamePlaceholder}
                      style={styles.inputFlex}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="document-text-outline" size={20} color="#9ca3af" />
                    <TextInput
                      value={editingItem.notes}
                      onChangeText={(notes) => setEditingItem({ ...editingItem, notes })}
                      placeholder={lang === 'zh' ? '备注（地址、链接、提醒等）' : 'Notes (address, link, reminder, etc.)'}
                      style={[styles.inputFlex, styles.notesInputInline]}
                      placeholderTextColor="#9ca3af"
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                </View>
              )}

              {screen === 'add_category' && (
                <View style={styles.inputCard}>
                  <View style={styles.inputRow}>
                    <View style={[styles.categoryDotInput, getBgStyle(COLORS[activeTrip?.categories.length ? activeTrip.categories.length % COLORS.length : 0])]} />
                    <TextInput value={newCategoryData.name} onChangeText={(name) => setNewCategoryData({ ...newCategoryData, name })} placeholder={t.categoryNamePlaceholder} style={styles.inputFlex} placeholderTextColor="#9ca3af" autoFocus />
                  </View>
                </View>
              )}

              {(screen === 'add_trip' || screen === 'edit_trip') && (
                <View style={styles.inputCard}>
                  <View style={styles.inputRow}>
                    <Pressable onPress={() => setShowEmojiPicker(true)} style={styles.emojiPickerButton}>
                      <Text style={styles.emojiPickerPreview}>{screen === 'add_trip' ? newTripData.icon : editTripData.icon}</Text>
                    </Pressable>
                    <TextInput
                      value={screen === 'add_trip' ? newTripData.destination : editTripData.destination}
                      onChangeText={(dest) => screen === 'add_trip' ? setNewTripData({ ...newTripData, destination: dest }) : setEditTripData({ ...editTripData, destination: dest })}
                      placeholder={t.destinationPlaceholder}
                      style={styles.inputFlex}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
{/* EmojiPicker rendered at top level to avoid ScrollView/Modal conflicts */}
                  <View style={styles.colorRow}>
                    {COLORS.map((c) => (
                      <Pressable key={c} onPress={() => (screen === 'add_trip' ? setNewTripData({ ...newTripData, color: c }) : setEditTripData({ ...editTripData, color: c }))} style={[styles.colorChip, getBgStyle(c), (screen === 'add_trip' ? newTripData.color : editTripData.color) === c && styles.colorChipSelected]}>
                        {(screen === 'add_trip' ? newTripData.color : editTripData.color) === c && <Ionicons name="checkmark" size={18} color="#fff" />}
                      </Pressable>
                    ))}
                    <Pressable onPress={() => {
                      const cur = screen === 'add_trip' ? newTripData.color : editTripData.color;
                      setPendingColor(cur || '#039BE5');
                      setShowColorPicker(true);
                    }} style={[styles.colorChip, !COLORS.includes(screen === 'add_trip' ? newTripData.color : editTripData.color) ? { backgroundColor: (screen === 'add_trip' ? newTripData.color : editTripData.color), borderWidth: 2, borderColor: '#374151' } : { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db' }]}>
                      {!COLORS.includes(screen === 'add_trip' ? newTripData.color : editTripData.color) ? <Ionicons name="checkmark" size={18} color="#fff" /> : <Ionicons name="color-palette-outline" size={18} color="#6b7280" />}
                    </Pressable>
                  </View>
                  <Modal visible={showColorPicker} transparent animationType="slide">
                    <View style={styles.emojiModalOverlay}>
                      <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowColorPicker(false)} />
                      <View style={[styles.emojiModalSheet, { paddingHorizontal: 20, paddingBottom: 36 }]}>
                        <View style={styles.emojiModalHandle} />
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151', textAlign: 'center', marginBottom: 16 }}>{lang === 'zh' ? '自定义颜色' : 'Custom Color'}</Text>
                        <ColorPicker
                          value={pendingColor}
                          onCompleteJS={({ hex }) => setPendingColor(hex)}
                        >
                          <Panel1 style={{ height: 180, borderRadius: 12, marginBottom: 16 }} />
                          <HueSlider style={{ height: 36, borderRadius: 18, marginBottom: 16 }} />
                          <Preview style={{ height: 44, borderRadius: 12 }} hideInitialColor />
                        </ColorPicker>
                        <Pressable
                          onPress={() => {
                            screen === 'add_trip' ? setNewTripData({ ...newTripData, color: pendingColor }) : setEditTripData({ ...editTripData, color: pendingColor });
                            setShowColorPicker(false);
                          }}
                          style={{ backgroundColor: pendingColor, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{lang === 'zh' ? '使用此颜色' : 'Use This Color'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Modal>
                  <View style={styles.inputRow}>
                    <Ionicons name="calendar-outline" size={20} color="#9ca3af" />
                    <Text style={styles.inputLabel}>{t.startDate}</Text>
                    {Platform.OS === 'web' ? (
                      <TextInput
                        value={screen === 'add_trip' ? newTripData.startDate : editTripData.startDate}
                        onChangeText={(d) => screen === 'add_trip' ? setNewTripData({ ...newTripData, startDate: d }) : setEditTripData({ ...editTripData, startDate: d })}
                        placeholder={t.dateOnlyPlaceholder}
                        style={styles.inputFlex}
                        placeholderTextColor="#9ca3af"
                      />
                    ) : (
                      <Pressable style={styles.datePressable} onPress={() => {
                        setPendingDate(parseDateSafe(screen === 'add_trip' ? newTripData.startDate : editTripData.startDate));
                        setOpenDatePicker('start');
                      }}>
                        <Text style={[styles.inputFlex, (screen === 'add_trip' ? newTripData.startDate : editTripData.startDate) ? styles.dateText : styles.datePlaceholder]}>
                          {(screen === 'add_trip' ? newTripData.startDate : editTripData.startDate)
                            ? formatDateDisplay(screen === 'add_trip' ? newTripData.startDate : editTripData.startDate)
                            : t.dateOnlyPlaceholder}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="calendar-outline" size={20} color="#9ca3af" />
                    <Text style={styles.inputLabel}>{t.endDate}</Text>
                    {Platform.OS === 'web' ? (
                      <TextInput
                        value={screen === 'add_trip' ? newTripData.endDate : editTripData.endDate}
                        onChangeText={(d) => screen === 'add_trip' ? setNewTripData({ ...newTripData, endDate: d }) : setEditTripData({ ...editTripData, endDate: d })}
                        placeholder={t.dateOnlyPlaceholder}
                        style={styles.inputFlex}
                        placeholderTextColor="#9ca3af"
                      />
                    ) : (
                      <Pressable style={styles.datePressable} onPress={() => {
                        setPendingDate(parseDateSafe(screen === 'add_trip' ? newTripData.endDate : editTripData.endDate));
                        setOpenDatePicker('end');
                      }}>
                        <Text style={[styles.inputFlex, (screen === 'add_trip' ? newTripData.endDate : editTripData.endDate) ? styles.dateText : styles.datePlaceholder]}>
                          {(screen === 'add_trip' ? newTripData.endDate : editTripData.endDate)
                            ? formatDateDisplay(screen === 'add_trip' ? newTripData.endDate : editTripData.endDate)
                            : t.dateOnlyPlaceholder}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {screen === 'transport_list' && activeTrip && (
                <View style={styles.inputCard}>
                  {(activeTrip.transports || []).map((tr, idx) => (
                    <View key={`tr-${idx}`} style={styles.listItemRow}>
                      <Pressable style={styles.listItemContent} onPress={() => { setEditTransportData(tr); setEditTransportIndex(idx); setScreen('edit_flight'); }}>
                        <Text style={styles.listItemEmoji}>{tr.type}</Text>
                        <View style={styles.listItemBody}>
                          <Text style={styles.listItemTitle} numberOfLines={1}>{tr.flightNumber || (lang === 'zh' ? '未命名' : 'Untitled')}</Text>
                          {(tr.from || tr.to) && <Text style={styles.listItemSub} numberOfLines={1}>{tr.from}{tr.from && tr.to ? ' → ' : ''}{tr.to}</Text>}
                          {(tr.departureTime || tr.arrivalTime) && <Text style={styles.listItemSub}>{tr.departureTime ? formatDateDisplay(tr.departureTime) : ''}{tr.departureTime && tr.arrivalTime ? ' → ' : ''}{tr.arrivalTime ? formatDateDisplay(tr.arrivalTime) : ''}</Text>}
                        </View>
                      </Pressable>
                      <Pressable onPress={() => Alert.alert(lang === 'zh' ? '删除' : 'Delete', lang === 'zh' ? '确定删除此交通信息？' : 'Delete this transport?', [{ text: t.cancel }, { text: lang === 'zh' ? '删除' : 'Delete', style: 'destructive', onPress: () => handleDeleteTransport(idx) }])} style={styles.listItemDelete}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable onPress={() => { setEditTransportData({ type: '✈️', flightNumber: '', from: '', to: '', departureTime: '', arrivalTime: '' }); setEditTransportIndex(-1); setScreen('edit_flight'); }} style={styles.listAddButton}>
                    <Ionicons name="add-circle-outline" size={22} color="#007AFF" />
                    <Text style={styles.listAddButtonText}>{t.addFlight}</Text>
                  </Pressable>
                </View>
              )}

              {screen === 'acc_list' && activeTrip && (
                <View style={styles.inputCard}>
                  {(activeTrip.accommodations || []).map((acc, idx) => (
                    <View key={`acc-${idx}`} style={styles.listItemRow}>
                      <Pressable style={styles.listItemContent} onPress={() => { setEditAccData(acc); setEditAccIndex(idx); setScreen('edit_acc'); }}>
                        <Text style={styles.listItemEmoji}>🏨</Text>
                        <View style={styles.listItemBody}>
                          <Text style={styles.listItemTitle} numberOfLines={1}>{acc.name || (lang === 'zh' ? '未命名' : 'Untitled')}</Text>
                          {acc.address && <Text style={styles.listItemSub} numberOfLines={1}>{acc.address}</Text>}
                          {(acc.checkIn || acc.checkOut) && <Text style={styles.listItemSub}>{acc.checkIn ? formatDateDisplay(acc.checkIn) : ''}{acc.checkIn && acc.checkOut ? ' → ' : ''}{acc.checkOut ? formatDateDisplay(acc.checkOut) : ''}</Text>}
                        </View>
                      </Pressable>
                      <Pressable onPress={() => Alert.alert(lang === 'zh' ? '删除' : 'Delete', lang === 'zh' ? '确定删除此住宿信息？' : 'Delete this accommodation?', [{ text: t.cancel }, { text: lang === 'zh' ? '删除' : 'Delete', style: 'destructive', onPress: () => handleDeleteAcc(idx) }])} style={styles.listItemDelete}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable onPress={() => { setEditAccData({ name: '', address: '', checkIn: '', checkOut: '' }); setEditAccIndex(-1); setScreen('edit_acc'); }} style={styles.listAddButton}>
                    <Ionicons name="add-circle-outline" size={22} color="#007AFF" />
                    <Text style={styles.listAddButtonText}>{t.addAcc}</Text>
                  </Pressable>
                </View>
              )}

              {screen === 'edit_flight' && (
                <View style={styles.inputCard}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.transportTypeScroll}>
                    {TRANSPORT_TYPES.map((tt) => (
                      <Pressable key={tt.emoji} onPress={() => setEditTransportData({ ...editTransportData, type: tt.emoji })} style={[styles.transportTypeChip, editTransportData.type === tt.emoji && styles.transportTypeChipActive]}>
                        <Text style={styles.transportTypeEmoji}>{tt.emoji}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.inputRow}>
                    <Text style={styles.transportTypeSelected}>{editTransportData.type}</Text>
                    <TextInput value={editTransportData.flightNumber} onChangeText={(v) => setEditTransportData({ ...editTransportData, flightNumber: v })} placeholder={t.flightNumber} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="navigate-outline" size={18} color="#9ca3af" />
                    <Text style={styles.inputLabel}>{t.fromPlace}</Text>
                    <TextInput value={editTransportData.from} onChangeText={(v) => setEditTransportData({ ...editTransportData, from: v })} placeholder={lang === 'zh' ? '如：伦敦希思罗' : 'e.g. London Heathrow'} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="location-outline" size={18} color="#9ca3af" />
                    <Text style={styles.inputLabel}>{t.toPlace}</Text>
                    <TextInput value={editTransportData.to} onChangeText={(v) => setEditTransportData({ ...editTransportData, to: v })} placeholder={lang === 'zh' ? '如：北京首都' : 'e.g. Beijing Capital'} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>{t.depTime}</Text>
                    {Platform.OS === 'web' ? (
                      <TextInput value={editTransportData.departureTime} onChangeText={(v) => setEditTransportData({ ...editTransportData, departureTime: v })} placeholder={t.dateOnlyPlaceholder} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                    ) : (
                      <Pressable style={styles.datePressable} onPress={() => { setPendingDate(parseDateSafe(editTransportData.departureTime, activeTrip?.startDate)); setOpenDatePicker('dep'); }}>
                        <Text style={[styles.inputFlex, editTransportData.departureTime ? styles.dateText : styles.datePlaceholder]}>
                          {editTransportData.departureTime ? formatDateDisplay(editTransportData.departureTime) : t.dateOnlyPlaceholder}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>{t.arrTime}</Text>
                    {Platform.OS === 'web' ? (
                      <TextInput value={editTransportData.arrivalTime} onChangeText={(v) => setEditTransportData({ ...editTransportData, arrivalTime: v })} placeholder={t.dateOnlyPlaceholder} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                    ) : (
                      <Pressable style={styles.datePressable} onPress={() => { setPendingDate(parseDateSafe(editTransportData.arrivalTime, activeTrip?.startDate)); setOpenDatePicker('arr'); }}>
                        <Text style={[styles.inputFlex, editTransportData.arrivalTime ? styles.dateText : styles.datePlaceholder]}>
                          {editTransportData.arrivalTime ? formatDateDisplay(editTransportData.arrivalTime) : t.dateOnlyPlaceholder}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {screen === 'edit_acc' && (
                <View style={styles.inputCard}>
                  <View style={styles.inputRow}>
                    <Ionicons name="bed-outline" size={20} color="#9ca3af" />
                    <TextInput value={editAccData.name} onChangeText={(v) => setEditAccData({ ...editAccData, name: v })} placeholder={t.hotelName} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="location-outline" size={20} color="#9ca3af" />
                    <TextInput value={editAccData.address} onChangeText={(v) => setEditAccData({ ...editAccData, address: v })} placeholder={t.address} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>{t.checkIn}</Text>
                    {Platform.OS === 'web' ? (
                      <TextInput value={editAccData.checkIn} onChangeText={(v) => setEditAccData({ ...editAccData, checkIn: v })} placeholder={t.dateOnlyPlaceholder} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                    ) : (
                      <Pressable style={styles.datePressable} onPress={() => { setPendingDate(parseDateSafe(editAccData.checkIn, activeTrip?.startDate)); setOpenDatePicker('checkIn'); }}>
                        <Text style={[styles.inputFlex, editAccData.checkIn ? styles.dateText : styles.datePlaceholder]}>
                          {editAccData.checkIn ? formatDateDisplay(editAccData.checkIn) : t.dateOnlyPlaceholder}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>{t.checkOut}</Text>
                    {Platform.OS === 'web' ? (
                      <TextInput value={editAccData.checkOut} onChangeText={(v) => setEditAccData({ ...editAccData, checkOut: v })} placeholder={t.dateOnlyPlaceholder} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                    ) : (
                      <Pressable style={styles.datePressable} onPress={() => { setPendingDate(parseDateSafe(editAccData.checkOut, activeTrip?.endDate || activeTrip?.startDate)); setOpenDatePicker('checkOut'); }}>
                        <Text style={[styles.inputFlex, editAccData.checkOut ? styles.dateText : styles.datePlaceholder]}>
                          {editAccData.checkOut ? formatDateDisplay(editAccData.checkOut) : t.dateOnlyPlaceholder}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {screen === 'notes' && (
                <View style={[styles.inputCard, styles.notesCard]}>
                  <TextInput value={editNotesData} onChangeText={setEditNotesData} placeholder={t.notesPlaceholder} style={styles.notesInput} multiline placeholderTextColor="#9ca3af" />
                </View>
              )}

              {screen === 'expenses' && activeTrip && (
                <>
                  <View style={styles.inputCard}>
                    <View style={styles.inputRow}>
                      <Ionicons name="cash-outline" size={20} color="#9ca3af" />
                      <View style={styles.currencyRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyScroll}>
                          {['£', '$', '€', '¥', '₩', '฿', 'A$', 'HK$'].map((curr) => (
                            <Pressable key={curr} onPress={() => setNewExpenseData({ ...newExpenseData, currency: curr })} style={[styles.currencyChip, newExpenseData.currency === curr && styles.currencyChipActive]}>
                              <Text style={styles.currencyChipText}>{curr}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                        <TextInput
                          value={newExpenseData.amount ? String(newExpenseData.amount) : ''}
                          onChangeText={(v) => setNewExpenseData({ ...newExpenseData, amount: Number(v) || 0 })}
                          placeholder={t.amount}
                          style={styles.inputFlex}
                          keyboardType="numeric"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>
                    </View>
                    <View style={styles.inputRow}>
                      <Ionicons name="pricetag-outline" size={20} color="#9ca3af" />
                      <TextInput value={newExpenseData.description} onChangeText={(d) => setNewExpenseData({ ...newExpenseData, description: d })} placeholder={lang === 'zh' ? '如：机票、酒店' : 'e.g. Flight, Hotel'} style={styles.inputFlex} placeholderTextColor="#9ca3af" />
                    </View>
                  </View>
                  <Pressable onPress={handleAddExpense} disabled={!newExpenseData.amount || !newExpenseData.description} style={[styles.primaryButton, (!newExpenseData.amount || !newExpenseData.description) && styles.primaryButtonDisabled]}>
                    <Text style={styles.primaryButtonText}>{t.addExpense}</Text>
                  </Pressable>
                  <View style={styles.expenseTotalRow}>
                    <Text style={styles.modalSectionLabel}>{t.total}</Text>
                    <Text style={styles.expenseTotalValue}>
                      {activeTrip.expenses && activeTrip.expenses.length > 0 ? `${activeTrip.expenses[0].currency}${activeTrip.expenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}` : '0'}
                    </Text>
                  </View>
                  {(activeTrip.expenses || []).map((expense) => (
                    <View key={expense.id} style={styles.expenseRow}>
                      <Text style={styles.expenseDesc} numberOfLines={1}>{expense.description}</Text>
                      <View style={styles.expenseRight}>
                        <Text style={styles.expenseAmount}>{expense.currency}{expense.amount.toLocaleString()}</Text>
                        <Pressable onPress={() => handleDeleteExpense(expense.id)}><Ionicons name="trash-outline" size={18} color="#ef4444" /></Pressable>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
            {Platform.OS !== 'web' && openDatePicker && (
              Platform.OS === 'ios' ? (
                <Modal visible transparent animationType="slide">
                  <View style={styles.datePickerOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpenDatePicker(null)} />
                    <View style={styles.datePickerModal}>
                      <View style={styles.datePickerToolbar}>
                        <Pressable onPress={() => setOpenDatePicker(null)}><Text style={styles.datePickerCancel}>{t.cancel}</Text></Pressable>
                        <Pressable onPress={() => {
                          const value = formatDateForInput(pendingDate);
                          applyDateValue(openDatePicker!, value);
                          setOpenDatePicker(null);
                        }}><Text style={styles.datePickerDone}>{t.save}</Text></Pressable>
                      </View>
                      <View style={styles.datePickerContent}>
                        <DateTimePicker
                          value={pendingDate}
                          mode="date"
                          display="spinner"
                          onChange={(_, selectedDate) => selectedDate && setPendingDate(selectedDate)}
                        />
                      </View>
                    </View>
                  </View>
                </Modal>
              ) : (
                <DateTimePicker
                  value={pendingDate}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    if ((event as { type?: string }).type === 'dismissed') {
                      setOpenDatePicker(null);
                      return;
                    }
                    if (selectedDate) {
                      applyDateValue(openDatePicker!, formatDateForInput(selectedDate));
                    }
                    setOpenDatePicker(null);
                  }}
                />
              )
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
    <EmojiPicker
      onEmojiSelected={(e) => {
        const emoji = (e && typeof e === 'object' && e.emoji) ? e.emoji : '✈️';
        if (screen === 'add_trip') {
          setNewTripData(prev => ({ ...prev, icon: emoji }));
        } else {
          setEditTripData(prev => ({ ...prev, icon: emoji }));
        }
        setShowEmojiPicker(false);
      }}
      open={showEmojiPicker}
      onClose={() => setShowEmojiPicker(false)}
      onRequestClose={() => setShowEmojiPicker(false)}
      enableSearchBar
      enableRecentlyUsed
    />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  flex1: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 120 },
  screenPadding: { paddingHorizontal: 20, paddingBottom: 24 },
  homeContentMinHeight: { minHeight: 1400 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 40, height: 40, backgroundColor: '#fff', borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sortMenuWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  sortMenu: { position: 'absolute', top: 48, right: 48, width: 192, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 4, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8, zIndex: 50 },
  sortItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  sortItemActive: { backgroundColor: 'rgba(37,99,235,0.08)' },
  sortItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  sortItemTextActive: { color: '#2563eb' },
  langButton: { height: 40, paddingHorizontal: 12, backgroundColor: '#fff', borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  langText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  tripList: { gap: 10 },
  emptyTrips: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTripsIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,122,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTripsTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptyTripsSub: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  emptyTripsHints: { width: '100%', gap: 14 },
  emptyTripsHintRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  emptyTripsHintText: { fontSize: 14, color: '#4b5563', flex: 1, lineHeight: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, marginLeft: 4 },
  tripCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  tripCardPast: { opacity: 0.85 },
  tripCardIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tripCardEmoji: { fontSize: 22, lineHeight: 26 },
  tripCardBody: { flex: 1 },
  tripCardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  tripCardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1, marginRight: 8 },
  tripCardBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)' },
  tripCardBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  tripCardDates: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripCardDatesText: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  tripCardArchived: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, opacity: 0.8 },
  tripCardIconWrapArchived: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#9ca3af', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tripCardEmojiArchived: { fontSize: 20, lineHeight: 24 },
  tripCardTitleArchived: { fontSize: 16, fontWeight: '700', color: '#4b5563', textDecorationLine: 'line-through' },
  tripCardDatesArchived: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  tripCardDatesTextArchived: { fontSize: 14, color: '#6b7280' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 16, marginTop: 24, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  primaryButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  primaryButtonSuccess: { backgroundColor: '#22c55e' },
  primaryButtonDisabled: { opacity: 0.5 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8, paddingHorizontal: 4 },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  backButtonText: { fontSize: 17, fontWeight: '600', color: '#007AFF', marginLeft: 0 },
  tripInfoCard: { borderRadius: 20, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  tripInfoCardEditIcon: { position: 'absolute', top: 12, right: 12, zIndex: 10 },
  tripInfoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  tripInfoTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 28 },
  tripInfoIconWrap: { marginRight: 10 },
  tripInfoEmoji: { fontSize: 24, lineHeight: 30 },
  tripInfoTitle: { fontSize: 20, fontWeight: '700', color: '#fff', flex: 1 },
  tripInfoBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  statusUpcoming: { backgroundColor: 'rgba(255,255,255,0.25)' },
  statusOngoing: { backgroundColor: 'rgba(255,255,255,0.25)' },
  statusPast: { backgroundColor: 'rgba(255,255,255,0.2)' },
  statusTextUpcoming: { color: '#fff' },
  statusTextOngoing: { color: '#fff' },
  statusTextPast: { color: 'rgba(255,255,255,0.8)' },
  tripInfoBadgeText: { fontSize: 14, fontWeight: '700' },
  tripInfoDatesBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: 'rgba(0,0,0,0.1)', padding: 12, borderRadius: 16 },
  tripInfoDatesText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.95)' },
  tripInfoDatesArrow: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  infoCard: { width: '48%', minHeight: 100, backgroundColor: '#fff', borderRadius: 24, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, justifyContent: 'center' },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  infoCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoCardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoCardIconWrap: { marginRight: 4 },
  infoCardValue: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  infoCardSub: { fontSize: 12, color: '#6b7280' },
  infoCardEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60 },
  infoCardEmptyText: { fontSize: 12, fontWeight: '500', color: '#9ca3af' },
  infoCardIconWrapEmpty: { marginBottom: 8 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24, width: '100%' },
  categoryCard: { width: '47%', backgroundColor: '#fff', borderRadius: 24, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  categoryDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 12 },
  categoryDotInput: { width: 14, height: 14, borderRadius: 7, marginRight: 4 },
  categoryName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  categoryCount: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  progressBar: { height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  addCategoryCard: { width: '47%', minHeight: 140, borderWidth: 2, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 24, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' },
  addCategoryText: { fontSize: 14, fontWeight: '500', color: '#9ca3af', marginTop: 8 },
  reorderButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 16 },
  reorderButtonText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  reorderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  reorderRowActive: { backgroundColor: '#f0f4ff', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6, borderRadius: 12 },
  reorderDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  reorderText: { fontSize: 16, fontWeight: '500', color: '#1f2937', flex: 1 },
  listItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  listItemContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  listItemEmoji: { fontSize: 24, marginRight: 12 },
  listItemBody: { flex: 1 },
  listItemTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  listItemSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  listItemDelete: { padding: 8 },
  listAddButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  listAddButtonText: { fontSize: 15, fontWeight: '600', color: '#007AFF' },
  infoCardBadge: { backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  infoCardBadgeText: { fontSize: 12, fontWeight: '700', color: '#3b82f6' },
  bottomActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  secondaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  secondaryButtonAlt: { backgroundColor: '#e5e7eb' },
  deleteTripButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 12 },
  deleteTripButtonText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  tripsFooter: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  listScreen: { flex: 1, paddingBottom: 96 },
  navActions: { flexDirection: 'row', gap: 12 },
  addItemButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  deleteIconButton: { backgroundColor: 'transparent' },
  listContent: { paddingHorizontal: 20, paddingTop: 8 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  listCategoryDot: { width: 14, height: 14, borderRadius: 7 },
  listTitle: { fontSize: 28, fontWeight: '700', color: '#111827' },
  itemListCard: { backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  emptyList: { padding: 32, alignItems: 'center' },
  emptyListText: { fontSize: 16, color: '#9ca3af' },
  emptyListSub: { fontSize: 14, color: '#9ca3af', marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  itemText: { flex: 1, fontSize: 17, color: '#111827' },
  itemTextCompleted: { color: '#9ca3af', textDecorationLine: 'line-through' },
  deleteItemBtn: { padding: 8 },
  swipeDeleteAction: { backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', width: 72, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  inlineAddRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12, gap: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  inlineAddInput: { flex: 1, fontSize: 16, color: '#111827', paddingVertical: 10 },
  inlineAddButton: { padding: 4 },
  inlineAddButtonDisabled: { opacity: 0.8 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F2F2F7', zIndex: 20, paddingTop: 48 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalCancel: { fontSize: 17, color: '#007AFF' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  modalSave: { fontSize: 17, fontWeight: '600', color: '#007AFF' },
  modalPlaceholder: { width: 48 },
  modalBody: { flex: 1 },
  modalBodyContent: { padding: 20, paddingBottom: 40 },
  modalSectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  shareOptionsCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  shareOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  shareOptionRowContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  shareOptionDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  shareOptionText: { fontSize: 17, color: '#111827' },
  checkboxSquare: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  checkboxSquareChecked: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  sharePreview: { backgroundColor: '#f3f4f6', borderRadius: 16, padding: 16, marginBottom: 24, maxHeight: 192, borderWidth: 1, borderColor: '#e5e7eb' },
  sharePreviewText: { fontSize: 14, color: '#4b5563', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  inputCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  textArea: { padding: 16, fontSize: 17, minHeight: 120, textAlignVertical: 'top' },
  transportTypeScroll: { paddingVertical: 12, paddingHorizontal: 16 },
  transportTypeChip: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  transportTypeChipActive: { backgroundColor: '#dbeafe', borderWidth: 2, borderColor: '#007AFF' },
  transportTypeEmoji: { fontSize: 24, lineHeight: 30 },
  transportTypeSelected: { fontSize: 22, marginRight: 8 },
  emojiPickerButton: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  emojiPickerPreview: { fontSize: 28, lineHeight: 34 },
  emojiModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  emojiModalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  emojiModalHandle: { width: 36, height: 5, backgroundColor: '#d1d5db', borderRadius: 3, alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  colorRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, justifyContent: 'center' },
  colorChip: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  colorChipSelected: { borderWidth: 2, borderColor: '#374151' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 12 },
  inputLabel: { width: 96, fontSize: 14, color: '#6b7280' },
  inputFlex: { flex: 1, fontSize: 17, color: '#111827', paddingVertical: 4 },
  datePressable: { flex: 1, paddingVertical: 4, justifyContent: 'center' },
  dateText: { fontSize: 17, color: '#111827' },
  datePlaceholder: { fontSize: 17, color: '#9ca3af' },
  datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  datePickerModal: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34 },
  datePickerToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  datePickerCancel: { fontSize: 17, color: '#007AFF' },
  datePickerDone: { fontSize: 17, fontWeight: '600', color: '#007AFF' },
  datePickerContent: { alignItems: 'center' },
  openLinkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  openLinkText: { fontSize: 16, color: '#007AFF', fontWeight: '500' },
  notesInputInline: { minHeight: 60, textAlignVertical: 'top' },
  itemLinkBtn: { padding: 8 },
  itemSortGroup: { flexDirection: 'row', alignItems: 'center' },
  itemSortBtn: { padding: 6 },
  notesCard: { minHeight: 480 },
  notesInput: { flex: 1, padding: 16, fontSize: 17, textAlignVertical: 'top' },
  currencyRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  currencyScroll: { maxWidth: 200 },
  currencyChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6', marginRight: 8 },
  currencyChipActive: { backgroundColor: '#007AFF' },
  currencyChipText: { fontSize: 17, color: '#111827' },
  expenseTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12, paddingHorizontal: 4 },
  expenseTotalValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  expenseDesc: { flex: 1, fontSize: 16, fontWeight: '500', color: '#111827', marginRight: 16 },
  expenseRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  expenseAmount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  // Tabs
  tabRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 24 },
  tabButton: { paddingBottom: 12, position: 'relative' },
  tabText: { fontSize: 18, fontWeight: '700', color: '#9ca3af' },
  tabTextActive: { color: '#111827' },
  tabIndicator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#111827', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  // AI Planner
  aiPlannerCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, minHeight: 300, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  aiPlannerEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  aiPlannerIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,122,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  aiPlannerTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  aiPlannerDesc: { fontSize: 14, color: '#6b7280', textAlign: 'center', maxWidth: 250, marginBottom: 24, lineHeight: 20 },
  aiGenerateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, shadowColor: '#007AFF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  aiGenerateButtonDisabled: { opacity: 0.7 },
  aiGenerateButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  aiResultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  aiResultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiResultTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  aiResultText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  aiResultContent: { gap: 4 },
  aiDayBlock: { marginTop: 16, marginBottom: 6 },
  aiDayText: { fontSize: 17, fontWeight: '700', color: '#111827', lineHeight: 24 },
  aiBulletBlock: { flexDirection: 'row', alignItems: 'flex-start', marginLeft: 4, marginBottom: 2 },
  aiBullet: { fontSize: 14, color: '#6b7280', marginRight: 8, lineHeight: 22 },
  aiBulletText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 22 },
  aiParagraphBlock: { marginBottom: 6 },
  aiParagraphText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  aiActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  aiActionButton: { flex: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#f0f7ff' },
  aiActionButtonText: { fontSize: 13, fontWeight: '600', color: '#007AFF' },
  // Voice FAB
  voiceFabContainer: { position: 'absolute', bottom: 24, right: 24, zIndex: 30 },
  voiceFab: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  voiceFabRecording: { backgroundColor: '#ef4444' },
  voiceFabProcessing: { backgroundColor: 'rgba(255,255,255,0.5)' },
});
