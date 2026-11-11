export function assignmentVisibilityForStudents(studentIds) {
  return {
    $or: [
      { targetStudents: { $size: 0 } },
      { targetStudents: { $in: studentIds } },
    ],
  }
}
