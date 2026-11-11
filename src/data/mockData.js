export const initialStudents = [
  { id: 1, name: 'Olivia Chen', email: 'olivia.chen@northstar.edu', grade: 'Grade 10', className: '10-A', attendance: 96, score: 92, status: 'Active', color: 'violet' },
  { id: 2, name: 'Ethan Williams', email: 'ethan.w@northstar.edu', grade: 'Grade 9', className: '9-B', attendance: 91, score: 84, status: 'Active', color: 'blue' },
  { id: 3, name: 'Amara Johnson', email: 'amara.j@northstar.edu', grade: 'Grade 11', className: '11-A', attendance: 98, score: 96, status: 'Active', color: 'rose' },
  { id: 4, name: 'Noah Patel', email: 'noah.patel@northstar.edu', grade: 'Grade 10', className: '10-B', attendance: 88, score: 79, status: 'At risk', color: 'amber' },
  { id: 5, name: 'Sofia Martinez', email: 'sofia.m@northstar.edu', grade: 'Grade 8', className: '8-A', attendance: 94, score: 89, status: 'Active', color: 'green' },
  { id: 6, name: 'Liam Thompson', email: 'liam.t@northstar.edu', grade: 'Grade 9', className: '9-A', attendance: 82, score: 73, status: 'Needs review', color: 'cyan' },
  { id: 7, name: 'Mia Robinson', email: 'mia.robinson@northstar.edu', grade: 'Grade 11', className: '11-B', attendance: 97, score: 94, status: 'Active', color: 'pink' },
  { id: 8, name: 'Lucas Kim', email: 'lucas.kim@northstar.edu', grade: 'Grade 8', className: '8-B', attendance: 93, score: 87, status: 'Active', color: 'indigo' },
]

export const initialTeachers = [
  { id: 1, name: 'Sophie Anderson', email: 's.anderson@northstar.edu', subject: 'Mathematics', classes: '8-A, 10-A', status: 'Active', color: 'violet' },
  { id: 2, name: 'Marcus Chen', email: 'm.chen@northstar.edu', subject: 'Science', classes: '9-B, 10-B', status: 'Active', color: 'blue' },
  { id: 3, name: 'Elena Rodriguez', email: 'e.rodriguez@northstar.edu', subject: 'English', classes: '11-A, 11-B', status: 'Active', color: 'rose' },
  { id: 4, name: 'David Thompson', email: 'd.thompson@northstar.edu', subject: 'History', classes: '8-B, 9-A', status: 'On leave', color: 'amber' },
]

export const initialAssignments = [
  { id: 1, title: 'Quadratic Equations — Problem Set', subject: 'Mathematics', className: '10-A', due: '2026-11-02', submitted: 24, total: 28, status: 'In progress' },
  { id: 2, title: 'The Water Cycle: Field Notes', subject: 'Science', className: '9-B', due: '2026-11-04', submitted: 18, total: 24, status: 'In progress' },
  { id: 3, title: 'Persuasive Writing Draft', subject: 'English', className: '11-A', due: '2026-11-06', submitted: 0, total: 22, status: 'Not started' },
  { id: 4, title: 'Chapter 6 Reading Response', subject: 'History', className: '8-A', due: '2026-10-28', submitted: 26, total: 26, status: 'Reviewing' },
]

export const initialSubmissions = [
  { id: 1, assignmentId: 1, student: 'Olivia Chen', submittedAt: 'Today · 9:42 AM', note: 'I used factoring first, then checked each solution by substituting it back into the equation.', status: 'Needs review', grade: '' },
  { id: 2, assignmentId: 1, student: 'Amara Johnson', submittedAt: 'Today · 8:16 AM', note: 'My completed problem set, including the challenge questions.', status: 'Needs review', grade: '' },
  { id: 3, assignmentId: 2, student: 'Ethan Williams', submittedAt: 'Yesterday · 3:18 PM', note: 'Field notes from our water cycle observation and a labeled diagram.', status: 'Reviewed', grade: '88' },
]

export const initialAnnouncements = [
  { id: 1, name: 'Northstar Academy', text: 'A reminder that parent evening is coming up on Monday, November 2. We can’t wait to welcome you into the classroom.', time: 'Today · 9:15 AM', color: 'blue' },
  { id: 2, name: 'Sophie Anderson', text: 'A little Friday celebration: 10-A made fantastic progress on their problem-solving challenge this week. Ask your student which strategy they liked best!', time: 'Yesterday · 2:30 PM', color: 'rose' },
]

export const initialNotifications = [
  { id: 1, title: 'New assignment submitted', detail: 'Olivia Chen submitted Quadratic Equations', time: '8 min ago', unread: true },
  { id: 2, title: 'Attendance needs attention', detail: '3 students are marked absent today', time: '24 min ago', unread: true },
  { id: 3, title: 'Staff meeting tomorrow', detail: 'Faculty lounge · 3:30 PM', time: '2 hours ago', unread: false },
]

export const attendanceByDay = [
  { day: 'Mon', present: 92, absent: 8 },
  { day: 'Tue', present: 96, absent: 4 },
  { day: 'Wed', present: 89, absent: 11 },
  { day: 'Thu', present: 94, absent: 6 },
  { day: 'Fri', present: 97, absent: 3 },
  { day: 'Sat', present: 0, absent: 0 },
  { day: 'Sun', present: 0, absent: 0 },
]

export const performanceByMonth = [
  { month: 'May', math: 72, science: 78, english: 80 },
  { month: 'Jun', math: 76, science: 75, english: 83 },
  { month: 'Jul', math: 73, science: 82, english: 81 },
  { month: 'Aug', math: 81, science: 84, english: 86 },
  { month: 'Sep', math: 84, science: 82, english: 89 },
  { month: 'Oct', math: 87, science: 88, english: 91 },
]

export const demoChats = [
  { id: 1, name: 'Sophie Anderson', role: 'Mathematics teacher', message: 'Olivia had a great breakthrough in class today!', time: '10:24 AM', color: 'violet' },
  { id: 2, name: 'Marcus Chen', role: 'Science teacher', message: 'The lab reports are ready for review.', time: 'Yesterday', color: 'blue' },
  { id: 3, name: 'Elena Rodriguez', role: 'English teacher', message: 'A quick note about the reading list.', time: 'Mon', color: 'rose' },
]

export const navigationByRole = {
  Admin: [
    { label: 'Overview', items: [['Overview', 'overview'], ['Analytics', 'analytics'], ['Reports', 'reports'], ['Dataset insights', 'dataset-insights']] },
    { label: 'School', items: [['Students', 'students'], ['Teachers', 'teachers'], ['Parents', 'parents'], ['Classes', 'classes'], ['Subjects', 'subjects']] },
    { label: 'Learning', items: [['Attendance', 'attendance'], ['Assignments', 'assignments'], ['Grades', 'grades']] },
    { label: 'Communication', items: [['Announcements', 'announcements'], ['Messages', 'messages']] },
  ],
  Teacher: [
    { label: 'My workspace', items: [['Overview', 'overview'], ['My classes', 'classes'], ['Students', 'students']] },
    { label: 'Teaching', items: [['Attendance', 'attendance'], ['Assignments', 'assignments'], ['Grades', 'grades'], ['Student support', 'learning-hub']] },
    { label: 'Communication', items: [['Messages', 'messages'], ['Announcements', 'announcements']] },
  ],
  Student: [
    { label: 'My school', items: [['Overview', 'overview'], ['Assignments', 'assignments'], ['Grades', 'grades']] },
    { label: 'Learning', items: [['Learning hub', 'learning-hub'], ['Attendance', 'attendance'], ['Timetable', 'timetable'], ['Report card', 'reports']] },
    { label: 'Connect', items: [['Messages', 'messages'], ['AI study buddy', 'assistant'], ['Announcements', 'announcements']] },
  ],
  Parent: [
    { label: 'Olivia’s school', items: [['Overview', 'overview'], ['Attendance', 'attendance'], ['Grades', 'grades']] },
    { label: 'Stay involved', items: [['Assignments', 'assignments'], ['Weekly digest', 'learning-hub'], ['Timetable', 'timetable'], ['Messages', 'messages']] },
    { label: 'School updates', items: [['Announcements', 'announcements'], ['Fee status', 'fees'], ['Reports', 'reports']] },
  ],
}
